import BonjourService from './lib/bonjour'
import * as imported from './lib/bonjour'

class Bonjour extends BonjourService {}

import BonjourClass = Bonjour

namespace Bonjour {
    export import Bonjour = BonjourClass
    export import Service = imported.Service
    export import Browser = imported.Browser
    export import ServiceReferer = imported.ServiceReferer
    export import ServiceConfig = imported.ServiceConfig
    export import BrowserConfig = imported.BrowserConfig
}

Object.defineProperty(Bonjour, 'default', {
    enumerable: true,
    value: Bonjour,
})

module.exports.Bonjour = Bonjour
module.exports.Service = imported.Service
module.exports.Browser = imported.Browser
module.exports.default = Bonjour

export = Bonjour
