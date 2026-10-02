/**
 * Viewer simulation presets, with the header names and value formats CloudFront uses
 * ("Add CloudFront request headers"). Device presets also set a matching User-Agent, which is what
 * CloudFront derives the device headers from.
 */
export interface Preset {
  label: string
  headers: Record<string, string>
}

const geo = (country: string, name: string, region: string, regionName: string, city: string, tz: string, lat: string, lon: string): Preset => ({
  label: `${country} · ${city}`,
  headers: {
    'CloudFront-Viewer-Country': country,
    'CloudFront-Viewer-Country-Name': name,
    'CloudFront-Viewer-Country-Region': region,
    'CloudFront-Viewer-Country-Region-Name': regionName,
    'CloudFront-Viewer-City': city,
    'CloudFront-Viewer-Time-Zone': tz,
    'CloudFront-Viewer-Latitude': lat,
    'CloudFront-Viewer-Longitude': lon,
  },
})

export const GEO_PRESETS: Preset[] = [
  geo('US', 'United States', 'WA', 'Washington', 'Seattle', 'America/Los_Angeles', '47.61', '-122.33'),
  geo('GB', 'United Kingdom', 'ENG', 'England', 'London', 'Europe/London', '51.51', '-0.13'),
  geo('FR', 'France', 'IDF', 'Île-de-France', 'Paris', 'Europe/Paris', '48.86', '2.35'),
  geo('DE', 'Germany', 'BE', 'Berlin', 'Berlin', 'Europe/Berlin', '52.52', '13.40'),
  geo('ES', 'Spain', 'MD', 'Madrid', 'Madrid', 'Europe/Madrid', '40.42', '-3.70'),
  geo('MX', 'Mexico', 'CMX', 'Ciudad de México', 'Mexico City', 'America/Mexico_City', '19.43', '-99.13'),
  geo('BR', 'Brazil', 'SP', 'São Paulo', 'São Paulo', 'America/Sao_Paulo', '-23.55', '-46.63'),
  geo('JP', 'Japan', '13', 'Tokyo', 'Tokyo', 'Asia/Tokyo', '35.68', '139.69'),
]

const device = (label: string, flags: { mobile?: boolean; tablet?: boolean; desktop?: boolean; tv?: boolean; ios?: boolean; android?: boolean }, ua: string): Preset => ({
  label,
  headers: {
    'CloudFront-Is-Mobile-Viewer': String(!!flags.mobile),
    'CloudFront-Is-Tablet-Viewer': String(!!flags.tablet),
    'CloudFront-Is-Desktop-Viewer': String(!!flags.desktop),
    'CloudFront-Is-SmartTV-Viewer': String(!!flags.tv),
    'CloudFront-Is-IOS-Viewer': String(!!flags.ios),
    'CloudFront-Is-Android-Viewer': String(!!flags.android),
    'User-Agent': ua,
  },
})

export const DEVICE_PRESETS: Preset[] = [
  device('iPhone', { mobile: true, ios: true }, 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'),
  device('Android phone', { mobile: true, android: true }, 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36'),
  // AWS: "for some tablet devices, CloudFront sets both CloudFront-Is-Mobile-Viewer and CloudFront-Is-Tablet-Viewer to true"
  device('iPad', { mobile: true, tablet: true, ios: true }, 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'),
  device('Desktop', { desktop: true }, 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'),
  device('Smart TV', { tv: true }, 'Mozilla/5.0 (SMART-TV; Linux; Tizen 8.0) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/7.0 TV Safari/537.36'),
]
