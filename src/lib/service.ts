/**
 * Bonjour Service - Service Definition
 */

import os                               from 'os'
import DnsTxt                           from './dns-txt'
import KeyValue                         from './KeyValue'
import { EventEmitter }                 from 'events'
import { toString as ServiceToString }  from './service-types'

const TLD: string = '.local'

export interface ServiceConfig {
    name        : string
    type        : string
    port        : number
    protocol?   : 'tcp' | 'udp'
    host?       : string
    fqdn?       : string
    subtypes?   : Array<string>
    txt?        : KeyValue

    probe?      : boolean
    disableIPv6?: boolean
}

export interface ServiceRecord {
    name        : string
    type        : 'PTR' | 'SRV' | 'TXT' | 'A' | 'AAAA'
    ttl         : number
    data        : KeyValue | string | any
}

export interface ServiceReferer {
    address : string
    family  : 'IPv4' | 'IPv6'
    port    : number
    size    : number
}

export class Service extends EventEmitter {

    public name         : string
    public type         : string
    public protocol     : 'tcp' | 'udp'
    public port         : number
    public host         : string
    public fqdn         : string
    public txt?         : any
    public subtypes?    : Array<string>
    public addresses?   : Array<string>
    public referer?     : ServiceReferer
    public disableIPv6  : boolean
    public lastSeen?    : number
    public ttl?         : number

    public probe        : boolean = true

    public published   : boolean = false
    public activated   : boolean = false
    public destroyed    : boolean = false

    public start?       : CallableFunction
    public stop?        : CallableFunction

    private txtService  : DnsTxt

    constructor(config: ServiceConfig) {
        super()

        this.txtService = new DnsTxt()

        if (!config.name) throw new Error('ServiceConfig requires `name` property to be set');
        if (!config.type) throw new Error('ServiceConfig requires `type` property to be set');
        if (!config.port) throw new Error('ServiceConfig requires `port` property to be set');

        this.name           = config.name.split('.').join('-')
        this.protocol       = config.protocol || 'tcp'
        this.type           = ServiceToString({ name: config.type, protocol: this.protocol })
        this.port           = config.port
        this.host           = config.host || os.hostname()
        this.fqdn           = `${this.name}.${this.type}${TLD}`
        this.txt            = config.txt
        this.subtypes       = config.subtypes
        this.disableIPv6    = !!config.disableIPv6
    }


    public records(): Array<ServiceRecord> {
        var records : Array<ServiceRecord>  = [this.RecordPTR(this), this.RecordSRV(this), this.RecordTXT(this)]

        // Handle subtypes
        for (let subtype of this.subtypes || []) {
            records.push(this.RecordSubtypePTR(this, subtype));
        }

        // Create record per interface address
        let ifaces  : Array<any> = Object.values(os.networkInterfaces())
        for(let iface of ifaces) {
            let addrs : Array<os.NetworkInterfaceInfo> = iface
            for(let addr of addrs) {
                if(addr.internal || addr.mac === '00:00:00:00:00:00') continue
                switch(addr.family) {
                    case 'IPv4':
                        records.push(this.RecordA(this, addr.address))
                        break
                    case 'IPv6':
                        if(this.disableIPv6) break
                        records.push(this.RecordAAAA(this, addr.address))
                        break
                }
            }
        }

        // Return all records
        return records
    }

    /**
     * Provide PTR record
     * @param service
     * @returns
     */
    private RecordPTR(service: Service): ServiceRecord {
        return {
            name    : `${service.type}${TLD}`,
            type    : 'PTR',
            ttl     : 28800,
            data    : service.fqdn
        }
    }

    /**
     * Provide PTR record for subtype
     * @param service
     * @param subtype
     * @returns
     */
     private RecordSubtypePTR(service: Service, subtype: string): ServiceRecord {
        return {
            name: `_${subtype}._sub.${service.type}${TLD}`,
            type: 'PTR',
            ttl: 28800,
            data: `${service.name}.${service.type}${TLD}`
        }
    }

    /**
     * Provide SRV record
     * @param service
     * @returns
     */
    private RecordSRV(service: Service): ServiceRecord {
        return {
            name    : service.fqdn,
            type    : 'SRV',
            ttl     : 120,
            data: {
                port    : service.port,
                target  : service.host
            }
        }
    }

    /**
     * Provide TXT record
     * @param service
     * @returns
     */
    private RecordTXT(service: Service): ServiceRecord {
        return {
            name    : service.fqdn,
            type    : 'TXT',
            ttl     : 4500,
            data    : this.txtService.encode(service.txt)
        }
    }

    /**
     * Provide A record
     * @param service
     * @param ip
     * @returns
     */
    private RecordA(service: Service, ip: string): ServiceRecord {
        return {
            name    : service.host,
            type    : 'A',
            ttl     : 120,
            data    : ip
        }
    }

    /**
     * Provide AAAA record
     * @param service
     * @param ip
     * @returns
     */
    private RecordAAAA(service: Service, ip: string): ServiceRecord {
        return {
            name    : service.host,
            type    : 'AAAA',
            ttl     : 120,
            data    : ip
        }
    }

}

export default Service
