/// <reference types="node" />

import { RemoteInfo, Socket, SocketType } from 'dgram'
import { Answer, Packet, Question, RecordType } from 'dns-packet'
import { EventEmitter } from 'events'

declare module 'multicast-dns' {
    /** Create a multicast DNS client/server. */
    function multicastDNS(options?: multicastDNS.Options): multicastDNS.Instance

    namespace multicastDNS {
        interface Options {
            type?       : SocketType
            port?       : number
            ip?         : string
            interface?  : string | string[]
            socket?     : Socket
            reuseAddr?  : boolean
            bind?       : string | false
            multicast?  : boolean
            ttl?        : number
            loopback?   : boolean
        }

        type Callback = (error?: Error) => void

        interface OutgoingRemoteInfo {
            port        : number
            address?    : string
            host?       : string
        }

        type QueryPacket = Packet & { type: 'query'; questions: Question[] }
        type ResponsePacket = Packet & { type: 'response' }
        type QueryInput = string | Question[] | Packet
        type ResponseInput = Answer[] | Packet

        interface Instance extends EventEmitter {
            send(value: Packet, callback?: Callback): void
            send(value: Packet, remoteInfo: OutgoingRemoteInfo, callback?: Callback): void

            query(query: QueryInput, callback?: Callback): void
            query(query: QueryInput, remoteInfo: OutgoingRemoteInfo, callback?: Callback): void
            query(query: string, type: RecordType | 'ANY', callback?: Callback): void
            query(query: string, type: RecordType | 'ANY', remoteInfo: OutgoingRemoteInfo, callback?: Callback): void

            respond(response: ResponseInput, callback?: Callback): void
            respond(response: ResponseInput, remoteInfo: OutgoingRemoteInfo, callback?: Callback): void
            response(response: ResponseInput, callback?: Callback): void
            response(response: ResponseInput, remoteInfo: OutgoingRemoteInfo, callback?: Callback): void

            update(): void
            destroy(callback?: () => void): void

            on(event: 'ready', listener: () => void): this
            on(event: 'packet', listener: (packet: Packet, rinfo: RemoteInfo) => void): this
            on(event: 'query', listener: (packet: QueryPacket, rinfo: RemoteInfo) => void): this
            on(event: 'response', listener: (packet: ResponsePacket, rinfo: RemoteInfo) => void): this
            on(event: 'networkInterface', listener: () => void): this
            on(event: 'error' | 'warning', listener: (error: Error) => void): this
            on(event: string | symbol, listener: (...args: any[]) => void): this

            once(event: 'ready', listener: () => void): this
            once(event: 'packet', listener: (packet: Packet, rinfo: RemoteInfo) => void): this
            once(event: 'query', listener: (packet: QueryPacket, rinfo: RemoteInfo) => void): this
            once(event: 'response', listener: (packet: ResponsePacket, rinfo: RemoteInfo) => void): this
            once(event: 'networkInterface', listener: () => void): this
            once(event: 'error' | 'warning', listener: (error: Error) => void): this
            once(event: string | symbol, listener: (...args: any[]) => void): this
        }
    }

    export = multicastDNS
}
