import KeyValue         from './KeyValue'

export class DnsTxt {

    private binary: boolean

    constructor(opts: KeyValue = {}) {
        this.binary = opts ? opts.binary : false
    }

    /**
     * Encode the KeyValue to buffer
     * @param data 
     * @returns 
     */
    public encode(data: KeyValue = {}) {
        return Object.entries(data)
        .map(([key, value]) => {
            let item: string = `${key}=${value}`
            return Buffer.from(item)
        })
    }

    /**
     * Decode the buffer to KeyValue
     * @param buffer 
     * @returns 
     */
    public decode(buffer: Buffer): KeyValue {
        var data: KeyValue = {}
        // Format buffer to KeyValue
        try {
            let format  : string        = buffer.toString()
            let parts   : Array<any>    = format.split(/=(.+)/)
            let key     : string        = parts[0]
            let value   : any           = parts[1]
            data[key] = value
        } catch(_) {}
        // Return data a KeyValue
        return data
    }

    /**
     * Decode all buffer items to KeyValye
     * @param buffer 
     * @returns 
     */
    public decodeAll(buffer: Array<Buffer>) {
        return buffer
        .filter(i => i.length > 1)
        .map(i => this.decode(i))
        .reduce((prev, curr) => {
            var obj         = prev
            let [key]       = Object.keys(curr)
            let [value]     = Object.values(curr)
            obj[key]        = value
            return obj
        }, {})
    }

}

export default DnsTxt
