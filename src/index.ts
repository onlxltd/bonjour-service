
import Registry                     from './lib/registry'
import Server                       from './lib/mdns-server'
import Browser, { BrowserConfig }   from './lib/browser'
import Service, { ServiceConfig, ServiceReferer }   from './lib/service'

export class Bonjour {

    private server      : Server
    private registry    : Registry

    /**
     * Setup bonjour service with optional config
     * @param opts ServiceConfig | undefined
     * @param errorCallback Function | undefined
     */
    constructor(opts?: ServiceConfig | undefined, errorCallback?: Function | undefined) {
        this.server     = new Server(opts, errorCallback)
        this.registry   = new Registry(this.server)
    }

    /**
     * Publish a service for the device with options
     * @param opts
     * @returns
     */
    public publish(opts: ServiceConfig): Service {
        return this.registry.publish(opts)
    }

    /**
     * Unpublish all services for the device
     * @param callback
     * @returns
     */
    public unpublishAll(callback?: CallableFunction | undefined): void {
        return this.registry.unpublishAll(callback)
    }

    /**
     * Find services on the network with options
     * @param opts BrowserConfig
     * @param onup Callback when up event received
     * @returns
     */
    public find(opts: BrowserConfig | undefined = undefined, onup?: (service: Service) => void): Browser {
        return new Browser(this.server.mdns, opts, onup)
    }

    /**
     * Find a single device and close browser
     * @param opts BrowserConfig
     * @param timeout Timeout (ms) if not device is found, default 10s
     * @param callback Callback when device found
     * @returns
     */
    public findOne(opts: BrowserConfig | undefined = undefined, timeout = 10000, callback?: CallableFunction): Browser {
        const browser: Browser = new Browser(this.server.mdns, opts)
        var timer: any
        browser.once('up', (service: Service) => {
            if(timer !== undefined) clearTimeout(timer)
            browser.stop()
            if(callback) callback(service)
        })
        timer = setTimeout(() => {
            browser.stop()
            if(callback) callback(null)
        }, timeout)
        return browser
    }

    /**
     * Destroy the class
     * @param callback Callback when underlying socket is closed
     */
    public destroy(callback?: CallableFunction) {
        this.registry.destroy()
        this.server.mdns.destroy(callback)
    }

}

export { Service, ServiceReferer, ServiceConfig, Browser, BrowserConfig }

export default Bonjour
