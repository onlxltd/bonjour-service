import flatten                      from 'array-flatten'
import Server                       from './mdns-server'
import Service, { ServiceConfig, ServiceRecord }   from './service'

const dnsEqual  = require('dns-equal')

const REANNOUNCE_MAX_MS : number    = 60 * 60 * 1000
const REANNOUNCE_FACTOR : number    = 3

export class Registry {

    private server      : Server
    private services    : Array<any> = []

    private activated  : boolean = false

    constructor(server: Server) {
        this.server = server
    }

    public publish(config: ServiceConfig): Service {
        let service     = new Service(config)
        service.start   = this.start.bind(service, this)
        service.stop    = this.stop.bind(service, this)
        service.start({ probe: config.probe !== false })
        return service
    }

    public unpublishAll(callback: CallableFunction | undefined) {
        this.teardown(this.server, this.services, callback)
        this.services = []
    }

    public destroy() {
        this.services.map(service => service.destroyed = true)
    }

    private start(registry: Registry, opts: Service) {
        if (this.activated) return
        this.activated = true

        registry.services.push(this)

        if(!(this instanceof Service)) return

        if(opts.probe) {
            var service: Service = this
            registry.probe(registry.server.mdns, this, (exists: any) => {
                if(exists) {
                    service.stop()
                    console.log(new Error('Service name is already in use on the network'))
                    return
                }
                registry.announce(registry.server, service)
            })
        } else {
            registry.announce(registry.server, this)
        }
    }

    private stop(registry: Registry, callback?: CallableFunction) {
        if (!this.activated) return

        if(!(this instanceof Service)) return
        registry.teardown(registry.server, this, callback)
      
        var index = registry.services.indexOf(this)
        if (index !== -1) registry.services.splice(index, 1)
    }

    /**
     * Check if a service name is already in use on the network.
     *
     * Used before announcing the new service.
     *
     * To guard against race conditions where multiple services are started
     * simultaneously on the network, wait a random amount of time (between
     * 0 and 250 ms) before probing.
     *
     */
    private probe(mdns: any, service: Service, callback: CallableFunction) {
        var sent    : boolean   = false
        var retries : number    = 0
        var timer   : any
    
        const send = () => {
            // abort if the service have or is being stopped in the meantime
            if (!service.activated || service.destroyed) return
        
            mdns.query(service.fqdn, 'ANY', function () {
                // This function will optionally be called with an error object. We'll
                // just silently ignore it and retry as we normally would
                sent = true
                timer = setTimeout(++retries < 3 ? send : done, 250)
                timer.unref()
            })
        }

        const onresponse = (packet: any) => {
            // Apparently conflicting Multicast DNS responses received *before*
            // the first probe packet is sent MUST be silently ignored (see
            // discussion of stale probe packets in RFC 6762 Section 8.2,
            // "Simultaneous Probe Tiebreaking" at
            // https://tools.ietf.org/html/rfc6762#section-8.2
            if (!sent) return
            if (packet.answers.some(matchRR) || packet.additionals.some(matchRR)) done(true)
        }
        
        const matchRR = (rr: Service) => {
            return dnsEqual(rr.name, service.fqdn)
        }
        
        const done = (exists: any) => {
            mdns.removeListener('response', onresponse)
            clearTimeout(timer)
            callback(!!exists)
        }

        mdns.on('response', onresponse)
        setTimeout(send, Math.random() * 250)
    }


    /**
     * Initial service announcement
     *
     * Used to announce new services when they are first registered.
     *
     * Broadcasts right away, then after 3 seconds, 9 seconds, 27 seconds,
     * and so on, up to a maximum interval of one hour.
     */
    private announce (server: Server, service: Service) {
        var delay = 1000
        var packet: Array<ServiceRecord> = service.records()
    
        // Register the records
        server.register(packet)

        const broadcast = () => {
            if (!service.activated || service.destroyed) return

            server.mdns.respond(packet, function () {
                // This function will optionally be called with an error object. We'll
                // just silently ignore it and retry as we normally would
                if (!service.published) {
                    service.activated = true
                    service.published = true
                    service.emit('up')
                }
                delay = delay * REANNOUNCE_FACTOR
                if (delay < REANNOUNCE_MAX_MS && !service.destroyed) {
                    setTimeout(broadcast, delay).unref()
                }
            })
        }
        broadcast()
    }
  
    /**
     * Stop the given services
     *
     * Besides removing a service from the mDNS registry, a "goodbye"
     * message is sent for each service to let the network know about the
     * shutdown.
     */
    private teardown (server: Server, services: Array<Service> | Service, callback: any) {
        if (!Array.isArray(services)) services = [services]
    
        services = services.filter((service: Service) =>  service.activated) // ignore services not currently starting or started
    
        var records: any = flatten.depth(services.map(function (service) {
            service.activated = false
            var records = service.records()
            records.forEach((record: ServiceRecord) => {
                record.ttl = 0 // prepare goodbye message
            })
            return records
        }), 1)
    
        if (records.length === 0) return callback && callback()
        server.unregister(records)
    
        // send goodbye message
        server.mdns.respond(records, function () {
            (services as Array<Service>).forEach(function (service) {
                service.published = false
            })
            if (typeof callback === "function") {
                callback.apply(null, arguments)
            }
        })
    }
}

export default Registry
