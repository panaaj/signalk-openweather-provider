// OpenWeather

import {
  Position,
  WeatherData,
  WeatherWarning,
  WeatherDataType,
  WeatherForecastType,
  WeatherReqParams
} from '@signalk/server-api'
import { WEATHER_CONFIG } from './weather-service'
import { WCache } from '../lib/cache'

interface OWObservation {
  dt: number
  sunrise: number
  sunset: number
  temp: number
  feels_like: number
  pressure: number
  humidity: number
  dew_point: number
  uvi: number
  clouds: number
  visibility: number
  wind_speed: number
  wind_deg: number
  weather: Array<{
    id: number
    main: string
    description: string
    icon: string
  }>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rain: { [key: string]: any }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  snow: { [key: string]: any }
}

interface OWForecast {
  dt: number
  sunrise: number
  sunset: number
  moonrise: number
  moonset: number
  moon_phase: number
  temp: {
    day: number
    min: number
    max: number
    night: number
    eve: number
    morn: number
  }
  feels_like: {
    day: number
    night: number
    eve: number
    morn: number
  }
  pressure: number
  humidity: number
  dew_point: number
  wind_speed: number
  wind_deg: number
  wind_gust: number
  weather: [
    {
      id: number
      main: string
      description: string
      icon: string
    }
  ]
  clouds: number
  pop: number
  uvi: number
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rain: { [key: string]: any }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  snow: { [key: string]: any }
}

interface OWWarning {
  sender_name: string
  event: string
  start: number
  end: number
  description: string
  tags: Array<string>
}

export interface OWResponse {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any
}

export class OpenWeather {
  private settings: WEATHER_CONFIG
  private wcache: WCache

  constructor(config: WEATHER_CONFIG, path: string) {
    this.settings = config
    this.wcache = new WCache(path)
    this.wcache.maxAge = this.settings.pollInterval
  }

  /**
   * Return a weather service request url
   *  @param position coordinates of location to retrieve weathe data for
   *  @returns url to send request to
   */
  private getUrl(position: Position): string {
    const api = 'https://api.openweathermap.org/data/3.0/onecall'
    if (!this.settings.apiKey || !position) {
      return ''
    } else {
      return `${api}?lat=${position.latitude}&lon=${position.longitude}&exclude=minutely&appid=${this.settings.apiKey}`
    }
  }

  /**
   * Fetch weather data from weather service for provided Position.
   *  @params position: {latitude, longitude}
   *  @returns OWResponse object
   */
  private async fetchData(position: Position): Promise<OWResponse> {
    try {
      const url = this.getUrl(position)
      const res = await fetch(url)
      const owData = await res.json()
      if ('cod' in owData) {
        throw new Error(owData.message)
      }
      // update cache
      const id = this.wcache.calcId(position)
      this.wcache.setEntry(id, owData)
      return owData
    } catch (err) {
      throw new Error(`Error fetching weather data from provider!`)
    }
  }

  /**
   * Fetch observations for provided Position and number of entries from cache | server.
   *  @params position: {latitude, longitude}
   *  @params count: Number of observation entries to return
   *  @params bypassCache: true = Always fetch from source (ignores the cache)
   */
  fetchObservations = async (
    position: Position,
    options?: WeatherReqParams,
    bypassCache?: boolean
  ): Promise<WeatherData[]> => {
    try {
      const entryId = this.wcache.contains(position)
      let owData: OWResponse
      if (bypassCache || !entryId) {
        owData = await this.fetchData(position)
      } else {
        owData = await this.wcache.getEntry(entryId)
      }
      const obs = this.parseOWObservations(owData)
      return options?.maxCount ? obs.slice(0, options.maxCount) : obs
    } catch (err) {
      throw new Error(`Error fetching / parsing weather data!`)
    }
  }

  /**
   * Fetch forecasts of the specified type for provided Position and number of entries from cache | server.
   *  @params position: {latitude, longitude}
   *  @params type Forecatst ype 'daily' | 'point'
   *  @params options: Number of forecast entries to retur, etc.
   *  @params bypassCache: true = Always fetch from source (ignores the cache)
   */
  fetchForecasts = async (
    position: Position,
    type: WeatherForecastType,
    options?: WeatherReqParams,
    bypassCache?: boolean
  ): Promise<WeatherData[]> => {
    try {
      const entryId = this.wcache.contains(position)
      let owData: OWResponse
      if (bypassCache || !entryId) {
        owData = await this.fetchData(position)
      } else {
        owData = await this.wcache.getEntry(entryId)
      }
      const f = this.parseOWForecasts(owData, type)
      return options?.maxCount ? f.slice(0, options.maxCount) : f
    } catch (err) {
      throw new Error(`Error fetching / parsing weather data from provider!`)
    }
  }

  /**
   * Fetch warnings for provided Position from cache | server.
   *  @params position: {latitude, longitude}
   *  @params bypassCache: true = Always fetch from source (ignores the cache)
   */
  fetchWarnings = async (
    position: Position,
    bypassCache?: boolean
  ): Promise<WeatherWarning[]> => {
    try {
      const entryId = this.wcache.contains(position)
      let owData: OWResponse
      if (bypassCache || !entryId) {
        owData = await this.fetchData(position)
      } else {
        owData = await this.wcache.getEntry(entryId)
      }
      return this.parseOWWarnings(owData)
    } catch (err) {
      throw new Error(`Error fetching / parsing weather data!`)
    }
  }

  private parseOWObservations(owData: OWResponse) {
    //server.debug(JSON.stringify(weatherData.current))
    const data: WeatherData[] = []
    let obs: WeatherData

    if (owData && owData.current) {
      const current: OWObservation = owData.current

      obs = {
        date: current.dt
          ? new Date(current.dt * 1000).toISOString()
          : new Date().toISOString(),
        description: current.weather[0].description ?? '',
        type: 'observation',
        sun: {},
        outside: {},
        water: {},
        wind: {}
      }

      if (obs.outside && typeof current.uvi !== 'undefined') {
        obs.outside.uvIndex = current.uvi
      }
      if (obs.outside && typeof current.clouds !== 'undefined') {
        obs.outside.cloudCover = current.clouds / 100
      }
      if (obs.outside && typeof current.visibility !== 'undefined') {
        obs.outside.horizontalVisibility = current.visibility
      }
      if (obs.outside && typeof current.temp !== 'undefined') {
        obs.outside.temperature = current.temp
      }
      if (obs.outside && typeof current.feels_like !== 'undefined') {
        obs.outside.feelsLikeTemperature = current.feels_like
      }
      if (obs.outside && typeof current.dew_point !== 'undefined') {
        obs.outside.dewPointTemperature = current.dew_point
      }
      if (obs.outside && typeof current.pressure !== 'undefined') {
        obs.outside.pressure = current.pressure * 100
      }
      if (obs.outside && typeof current.humidity !== 'undefined') {
        obs.outside.absoluteHumidity = current.humidity / 100
      }
      if (
        obs.outside &&
        typeof current.rain !== 'undefined' &&
        typeof current.rain['1h'] !== 'undefined'
      ) {
        obs.outside.precipitationType = 'rain'
        obs.outside.precipitationVolume = current.rain['1h']
      } else {
        if (
          obs.outside &&
          current.snow &&
          typeof current.snow['1h'] !== 'undefined'
        ) {
          obs.outside.precipitationType = 'snow'
          obs.outside.precipitationVolume = current.snow['1h']
        }
      }

      if (obs.sun && typeof current.sunrise !== 'undefined') {
        obs.sun.sunrise = new Date(current.sunrise * 1000).toISOString()
      }
      if (obs.sun && typeof current.sunset !== 'undefined') {
        obs.sun.sunset = new Date(current.sunset * 1000).toISOString()
      }

      if (obs.wind && typeof current.wind_speed !== 'undefined') {
        obs.wind.speedTrue = current.wind_speed
      }
      if (obs.wind && typeof current.wind_deg !== 'undefined') {
        obs.wind.directionTrue = (Math.PI / 180) * current.wind_deg
      }

      // clean obs
      if (obs.sun && Object.keys(obs.sun).length === 0) {
        delete obs.sun
      }
      if (obs.water && Object.keys(obs.water).length === 0) {
        delete obs.water
      }
      if (obs.wind && Object.keys(obs.wind).length === 0) {
        delete obs.wind
      }
      if (obs.outside && Object.keys(obs.outside).length === 0) {
        delete obs.outside
      }
      data.push(obs)
    }

    return data
  }

  private parseOWForecasts(
    owData: OWResponse,
    period: WeatherDataType = 'point'
  ) {
    const data: WeatherData[] = []
    const owPeriod = period === 'point' ? 'hourly' : 'daily'

    if (owData && Array.isArray(owData[owPeriod])) {
      const forecasts = owData[owPeriod]
      forecasts.forEach((f: OWForecast) => {
        const forecast: WeatherData = {
          type: period,
          date: f.dt
            ? new Date(f.dt * 1000).toISOString()
            : new Date().toISOString(),
          description: f.weather[0].description ?? ''
        }
        forecast.outside = {}
        if (period === 'daily') {
          forecast.sun = {}
          if (typeof f.sunrise !== 'undefined') {
            forecast.sun.sunrise = new Date(f.sunrise * 1000).toISOString()
          }
          if (typeof f.sunset !== 'undefined') {
            forecast.sun.sunset = new Date(f.sunset * 1000).toISOString()
          }

          if (typeof f.temp.min !== 'undefined') {
            forecast.outside.minTemperature = f.temp.min
          }
          if (typeof f.temp.max !== 'undefined') {
            forecast.outside.maxTemperature = f.temp.max
          }
          if (typeof f.feels_like.day !== 'undefined') {
            forecast.outside.feelsLikeTemperature = f.feels_like.day
          }
        } else {
          if (typeof f.feels_like !== 'undefined') {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            forecast.outside.feelsLikeTemperature = f.feels_like as any
          }
          if (typeof f.temp !== 'undefined') {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            forecast.outside.temperature = f.temp as any
          }
        }
        if (typeof f.dew_point !== 'undefined') {
          forecast.outside.dewPointTemperature = f.dew_point
        }
        if (typeof f.uvi !== 'undefined') {
          forecast.outside.uvIndex = f.uvi
        }
        if (typeof f.clouds !== 'undefined') {
          forecast.outside.cloudCover = f.clouds / 100
        }
        if (typeof f.pressure !== 'undefined') {
          forecast.outside.pressure = f.pressure * 100
        }
        if (typeof f.humidity !== 'undefined') {
          forecast.outside.absoluteHumidity = f.humidity / 100
        }

        forecast.wind = {}
        if (typeof f.wind_speed !== 'undefined') {
          forecast.wind.speedTrue = f.wind_speed
        }
        if (typeof f.wind_deg !== 'undefined') {
          forecast.wind.directionTrue = (Math.PI / 180) * f.wind_deg
        }
        if (typeof f.wind_gust !== 'undefined') {
          forecast.wind.gust = f.wind_gust
        }
        if (f.rain && typeof f.rain['1h'] !== 'undefined') {
          forecast.outside.precipitationType = 'rain'
          forecast.outside.precipitationVolume = f.rain['1h'] ?? null
        } else if (f.snow && typeof f.snow['1h'] !== 'undefined') {
          forecast.outside.precipitationType = 'snow'
          forecast.outside.precipitationVolume = f.snow['1h'] ?? null
        }

        // clean forecast
        if (forecast.sun && Object.keys(forecast.sun).length === 0) {
          delete forecast.sun
        }
        if (forecast.water && Object.keys(forecast.water).length === 0) {
          delete forecast.water
        }
        if (forecast.wind && Object.keys(forecast.wind).length === 0) {
          delete forecast.wind
        }
        if (forecast.wind && Object.keys(forecast.outside).length === 0) {
          delete forecast.outside
        }
        data.push(forecast)
      })
    }
    return data
  }

  private parseOWWarnings(owData: OWResponse): WeatherWarning[] {
    const data: WeatherWarning[] = []
    if (owData && owData.alerts) {
      const alerts: OWWarning[] = owData.alerts
      alerts.forEach((alert: OWWarning) => {
        const warn: WeatherWarning = {
          startTime: alert.start
            ? new Date(alert.start * 1000).toISOString()
            : '',
          endTime: alert.end ? new Date(alert.start * 1000).toISOString() : '',
          details: alert.description ?? null,
          source: alert.sender_name ?? null,
          type: alert.event ?? null
        }
        data.push(warn)
      })
    }

    return data
  }
}
