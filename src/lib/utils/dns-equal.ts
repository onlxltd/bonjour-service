
const capitalLetterRegex : RegExp = /[A-Z]/g

function toLowerCase(input: string) {
    return input.toLowerCase()
}

export default function dnsEqual(a: string, b: string) : boolean {
    const aFormatted = a.replace(capitalLetterRegex, toLowerCase)
    const bFormatted = b.replace(capitalLetterRegex, toLowerCase)

    return aFormatted === bFormatted
}