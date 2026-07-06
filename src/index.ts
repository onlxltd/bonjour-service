import BonjourService, { Service as ServiceClass, Browser as BrowserClass }                                                     from './lib/bonjour'
import type { ServiceReferer as ServiceRefererType, ServiceConfig as ServiceConfigType, BrowserConfig as BrowserConfigType }    from './lib/bonjour'

class Bonjour extends BonjourService {}

const BonjourConstructor = Bonjour

namespace Bonjour {
    export const Bonjour = BonjourConstructor
    export const Service = ServiceClass
    export const Browser = BrowserClass
    export type ServiceReferer = ServiceRefererType
    export type ServiceConfig = ServiceConfigType
    export type BrowserConfig = BrowserConfigType
}

Object.defineProperty(Bonjour, 'default', {
    enumerable: true,
    value: Bonjour,
})

module.exports.Bonjour = Bonjour
module.exports.Service = ServiceClass
module.exports.Browser = BrowserClass
module.exports.default = Bonjour

export = Bonjour
