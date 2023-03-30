import KeyValue                                                     from './KeyValue'
import DnsTxt                                                       from './dns-txt'
import dnsEqual                                                     from './utils/dns-equal'
import { EventEmitter }                                             from 'events'
import Service, { ServiceRecord }                                   from './service'
import { toString as ServiceToString, toType as ServiceToType }     from './service-types'
import filterService                                                from './utils/filter-service'
import filterTxt                                                    from './utils/filter-txt'

const TLD           = '.local'
const WILDCARD      = '_services._dns-sd._udp' + TLD


export interface BrowserConfig {
    type: string
    protocol?: 'tcp' | 'udp'
    subtypes?: Array<string>
    txt?: any
}

/**
 * Start a browser
 *
 * The browser listens for services by querying for PTR records of a given
 * type, protocol and domain, e.g. _http._tcp.local.
 *
 * If no type is given, a wild card search is performed.
 *
 * An internal list of online services is kept which starts out empty. When
 * ever a new service is discovered, it's added to the list and an "up" event
 * is emitted with that service. When it's discovered that the service is no
 * longer available, it is removed from the list and a "down" event is emitted
 * with that service.
 */

export class Browser extends EventEmitter {

    private mdns        : any
    private onresponse  : any       = null
    private serviceMap  : KeyValue  = {}

    private txt         : any
    private name?       : string
    private txtQuery    : KeyValue | undefined
    private wildcard    : boolean   = false

    private _services    : Array<any> = []

    constructor(mdns: any, opts: any, onup?: (service: Service) => void) {
        super()

        if (typeof opts === 'function') return new Browser(mdns, null, opts)

        this.mdns   = mdns

        if(opts != null && opts.txt != null) {
            this.txt    = new DnsTxt(opts.txt)
        } else {
            this.txt    = new DnsTxt()
        }

        if (!opts || !opts.type) {
            this.name = WILDCARD
            this.wildcard = true
        } else {
            this.name = ServiceToString({ name: opts.type, protocol: opts.protocol || 'tcp'}) + TLD
            if (opts.name) this.name = opts.name + '.' + this.name
            this.wildcard = false
        }

        // Provide a txt query, filter binary key if provided
        if(opts != null && opts.txt !== undefined) this.txtQuery = filterTxt(opts.txt)

        if (onup) this.on('up', onup)

        this.start()
    }

    public start() {
        if (this.onresponse || this.name === undefined) return

        var self = this

        // List of names for the browser to listen for. In a normal search this will
        // be the primary name stored on the browser. In case of a wildcard search
        // the names will be determined at runtime as responses come in.
        var nameMap: KeyValue = {}
        if (!this.wildcard) nameMap[this.name] = true

        this.onresponse = (packet: any, rinfo: any) => {
            if (self.wildcard) {
                packet.answers.forEach((answer: any) => {
                    if (answer.type !== 'PTR' || answer.name !== self.name || answer.name in nameMap) return
                    nameMap[answer.data] = true
                    self.mdns.query(answer.data, 'PTR')
                })
            }

            Object.keys(nameMap).forEach(function (name) {
                // unregister all services shutting down
                self.goodbyes(name, packet).forEach(self.removeService.bind(self))

                // register all new services
                var matches = self.buildServicesFor(name, packet, self.txt, rinfo)
                if (matches.length === 0) return

                matches.forEach((service: Service) => {
                    if (self.serviceMap[service.fqdn]) return // ignore already registered services
                    self.addService(service)
                })
            })
        }

        this.mdns.on('response', this.onresponse)
        this.update()
    }

    public stop() {
        if (!this.onresponse) return

        this.mdns.removeListener('response', this.onresponse)
        this.onresponse = null
    }

    public update() {
        this.mdns.query(this.name, 'PTR')
    }

    public get services() {
        return this._services;
    }

    private addService(service: Service) {
        // Test if service allowed by TXT query
        if(filterService(service, this.txtQuery) === false) return
        this._services.push(service)
        this.serviceMap[service.fqdn] = true
        this.emit('up', service)
    }

    private removeService(fqdn: string) {
        var service, index
        this._services.some(function (s, i) {
            if(dnsEqual(s.fqdn, fqdn)) {
                service = s
                index = i
                return true
            }
        })
        if (!service || index === undefined) return
        this._services.splice(index, 1)
        delete this.serviceMap[fqdn]
        this.emit('down', service)
    }

    // PTR records with a TTL of 0 is considered a "goodbye" announcement. I.e. a
    // DNS response broadcasted when a service shuts down in order to let the
    // network know that the service is no longer going to be available.
    //
    // For more info see:
    // https://tools.ietf.org/html/rfc6762#section-8.4
    //
    // This function returns an array of all resource records considered a goodbye
    // record
    private goodbyes(name: string, packet: any) {
        return packet.answers.concat(packet.additionals)
        .filter((rr: ServiceRecord) => rr.type === 'PTR' && rr.ttl === 0 && dnsEqual(rr.name, name))
        .map((rr: ServiceRecord) => rr.data)
    }

    // subytpes are in additional PTR records, with identical service names
    //
    // Note that only one subtype is allowed per record, but there may be multiple records
    //
    // For more info see:
    // https://tools.ietf.org/html/rfc6763#section-7.1
    //  Selective Instance Enumeration (Subtypes)
    //
    private buildServicesFor(name: string, packet: any, txt: any, referer: any) {
        var records = packet.answers.concat(packet.additionals).filter( (rr: ServiceRecord) => rr.ttl > 0) // ignore goodbye messages

        return records
          .filter((rr: ServiceRecord) => rr.type === 'PTR' && dnsEqual(rr.name, name))
          .map((ptr: ServiceRecord) => {
            const service: KeyValue = {
              addresses: [],
              subtypes: []
            }

            records.filter((rr: ServiceRecord) => {
                return (rr.type === 'PTR' && dnsEqual(rr.data, ptr.data) && rr.name.includes('._sub'))
              }).forEach((rr: ServiceRecord) => {
                const types = ServiceToType(rr.name)
                service.subtypes.push(types.subtype)
            })

            records
              .filter((rr: ServiceRecord) => {
                return (rr.type === 'SRV' || rr.type === 'TXT') && dnsEqual(rr.name, ptr.data)
              })
              .forEach((rr: ServiceRecord) => {
                if (rr.type === 'SRV') {
                  var parts = rr.name.split('.')
                  var name = parts[0]
                  var types = ServiceToType(parts.slice(1, -1).join('.'))
                  service.name = name
                  service.fqdn = rr.name
                  service.host = rr.data.target
                  service.referer = referer
                  service.port = rr.data.port
                  service.type = types.name
                  service.protocol = types.protocol
                } else if (rr.type === 'TXT') {
                  service.rawTxt = rr.data
                  service.txt = this.txt.decodeAll(rr.data)
                }
              })

            if (!service.name) return

            records
              .filter((rr: ServiceRecord) => (rr.type === 'A' || rr.type === 'AAAA') && dnsEqual(rr.name, service.host))
              .forEach((rr: ServiceRecord) => service.addresses.push(rr.data))

            return service
          })
          .filter((rr: ServiceRecord) => !!rr)
      }

}

export default Browser