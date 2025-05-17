import { SKVersion, Position } from '@signalk/server-api'
import { OpenWeatherProviderApp } from '..'
import { OpenWeather } from './openweather'

/**
 * @todo remove reference to mock-weather-api
 */
import {
  WeatherData,
  WeatherForecastType,
  WeatherReqParams,
  WeatherWarning
} from '../lib/mock-weather-api'
// *************************************************

export interface WEATHER_CONFIG {
  apiKey: string
  enable: boolean
  pollInterval: number
}

let server: OpenWeatherProviderApp
let pluginId: string

const wakeInterval = 60000
let lastWake: number // last wake time
let lastFetch: number // last successful fetch
let fetchInterval = 3600000 // 1hr
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let timer: any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let retryTimer: any
const retry = {
  interval: 10000, // time to wait after a failed api request
  maxCount: 3, // max number of retries on failed api connection
  count: 0 // number of retries on failed api connection
}
const noPosRetry = {
  count: 0, // number of retries to attempted when no position detected
  maxCount: 12, // maximum number of retries to attempt when no position detected
  interval: 10000 // time to wait between retires when no position detected
}
let weatherService: OpenWeather

const weatherServiceName = 'OpenWeather'

export const WEATHER_POLL_INTERVAL = [15, 30, 60]

const providerRegistration = {
  name: weatherServiceName,
  methods: {
    getObservations: (position: Position, options?: WeatherReqParams) => {
      return getObservationData(position, options)
    },
    getForecasts: (
      position: Position,
      type: WeatherForecastType,
      options?: WeatherReqParams
    ) => {
      return getForecastData(position, type, options)
    },
    getWarnings: (position: Position) => {
      return getWarnings(position)
    }
  }
}

/**
 * Process Observations request
 * @param position
 * @returns
 */
export const getObservationData = async (
  position: Position,
  options?: WeatherReqParams
): Promise<WeatherData[]> => {
  try {
    const r = await weatherService.fetchObservations(position, options)
    return r
  } catch (err) {
    throw new Error('Error fetching observation data from provider!')
  }
}

/**
 * Process Forecasts request
 * @param position
 * @param type
 * @param count
 * @returns
 */
export const getForecastData = async (
  position: Position,
  type: WeatherForecastType,
  options?: WeatherReqParams
): Promise<WeatherData[]> => {
  try {
    const r = await weatherService.fetchForecasts(position, type, options)
    return r
  } catch (err) {
    throw new Error('Error fetching observation data from provider!')
  }
}

/**
 * Process warnings request
 * @param position
 * @param type
 * @param count
 * @returns
 */
export const getWarnings = async (
  position: Position
): Promise<WeatherWarning[]> => {
  try {
    const r = await weatherService.fetchWarnings(position)
    return r
  } catch (err) {
    throw new Error('Error fetching weather warnings from provider!')
  }
}

/**
 * Initialise Weather provider
 * @param app Server app
 * @param id plugin id
 * @param config
 */
export const initWeather = (
  app: OpenWeatherProviderApp,
  id: string,
  config: WEATHER_CONFIG
) => {
  server = app
  pluginId = id
  fetchInterval = (config.pollInterval ?? 60) * 60000
  if (isNaN(fetchInterval)) {
    fetchInterval = 60 * 60000
  }

  server.debug(
    `*** Weather: settings: ${JSON.stringify(
      config
    )}, fetchInterval: ${fetchInterval}`
  )

  server.registerWeatherProvider(providerRegistration)

  weatherService = new OpenWeather(config, server.getDataDirPath())

  if (config.enable) {
    pollWeatherData()
  }
}

/**
 * Stop timers and clean up
 */
export const stopWeather = () => {
  if (timer) {
    clearInterval(timer)
  }
  if (retryTimer) {
    clearTimeout(retryTimer)
  }
  lastFetch = fetchInterval - 1
}

/** Fetch data at current vessel position at specified interval. */
const pollWeatherData = async () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pos: any = server.getSelfPath('navigation.position')
  if (!pos) {
    server.debug(`*** Weather: No vessel position detected!`)
    if (noPosRetry.count >= noPosRetry.maxCount) {
      server.debug(
        `*** Weather: Maximum number of retries to detect vessel position!... sleeping.`
      )
      return
    }
    noPosRetry.count++
    retryTimer = setTimeout(() => {
      server.debug(
        `*** Weather: RETRY = ${noPosRetry.count} / ${noPosRetry.maxCount} after no vessel position detected!`
      )
      pollWeatherData()
    }, noPosRetry.interval)
    return
  }
  server.debug(`*** Vessel position: ${JSON.stringify(pos.value)}.`)
  noPosRetry.count = 0
  if (retryTimer) {
    clearTimeout(retryTimer)
  }
  if (lastFetch) {
    const e = Date.now() - lastFetch
    if (e < fetchInterval) {
      server.debug(
        `*** Weather: Next poll due in ${Math.round(
          (fetchInterval - e) / 60000
        )} min(s)... sleep for ${wakeInterval / 1000} secs...`
      )
      return
    }
  }
  if (retry.count < retry.maxCount) {
    retry.count++
    server.debug(
      `*** Weather: Calling service API.....(attempt: ${retry.count})`
    )

    server.debug(`Position: ${JSON.stringify(pos.value)}`)
    server.debug(`*** Weather: polling weather provider.`)
    try {
      const obs = await weatherService.fetchObservations(
        pos.value,
        undefined,
        true
      )
      server.debug(`*** Weather: data received....`)
      retry.count = 0
      lastFetch = Date.now()
      lastWake = Date.now()
      emitMeteoDeltas(pos.value, obs[0])
      timer = setInterval(() => {
        server.debug(`*** Weather: wake from sleep....poll provider.`)
        const dt = Date.now() - lastWake
        // check for runaway timer
        if (dt >= 50000) {
          server.debug('Wake timer watchdog -> OK')
          server.debug(`*** Weather: Polling provider.`)
        } else {
          server.debug('Wake timer watchdog -> NOT OK... Stopping wake timer!')
          server.debug(`Watch interval < 50 secs. (${dt / 1000} secs)`)
          clearInterval(timer)
          server.setPluginError('Weather watch timer error!')
        }
        lastWake = Date.now()
        pollWeatherData()
      }, wakeInterval)
    } catch (err) {
      server.debug(
        `*** Weather: ERROR polling weather provider! (retry in ${
          retry.interval / 1000
        } sec)`
      )
      server.debug((err as Error).message)
      // sleep and retry
      retryTimer = setTimeout(() => pollWeatherData(), retry.interval)
    }
  } else {
    // max retries. sleep and retry?
    retry.count = 0
    console.log(
      `*** Weather: Failed to fetch data after ${retry.maxCount} attempts.\nRestart ${pluginId} plugin to retry.`
    )
  }
}

const emitMeteoDeltas = (position: Position, obs: WeatherData) => {
  const pathRoot = 'environment'
  const deltaValues = []

  server.debug('**** METEO - emit deltas*****')

  deltaValues.push({
    path: 'navigation.position',
    value: position
  })

  server.debug('**** METEO OBS *****')

  deltaValues.push({
    path: ``,
    value: { name: weatherServiceName }
  })

  if (typeof obs.date !== 'undefined') {
    deltaValues.push({
      path: `${pathRoot}.date`,
      value: obs.date
    })
  }
  if (typeof obs.outside?.horizontalVisibility !== 'undefined') {
    deltaValues.push({
      path: `${pathRoot}.outside.horizontalVisibility`,
      value: obs.outside.horizontalVisibility
    })
  }
  if (typeof obs.sun?.sunrise !== 'undefined') {
    deltaValues.push({
      path: `${pathRoot}.sun.sunrise`,
      value: obs.sun.sunrise
    })
  }
  if (typeof obs.sun?.sunset !== 'undefined') {
    deltaValues.push({
      path: `${pathRoot}.sun.sunset`,
      value: obs.sun.sunset
    })
  }
  if (typeof obs.outside?.uvIndex !== 'undefined') {
    deltaValues.push({
      path: `${pathRoot}.outside.uvIndex`,
      value: obs.outside.uvIndex
    })
  }
  if (typeof obs.outside?.cloudCover !== 'undefined') {
    deltaValues.push({
      path: `${pathRoot}.outside.cloudCover`,
      value: obs.outside.cloudCover
    })
  }
  if (typeof obs.outside?.temperature !== 'undefined') {
    deltaValues.push({
      path: `${pathRoot}.outside.temperature`,
      value: obs.outside.temperature
    })
  }
  if (typeof obs.outside?.dewPointTemperature !== 'undefined') {
    deltaValues.push({
      path: `${pathRoot}.outside.dewPointTemperature`,
      value: obs.outside.dewPointTemperature
    })
  }
  if (typeof obs.outside?.feelsLikeTemperature !== 'undefined') {
    deltaValues.push({
      path: `${pathRoot}.outside.feelsLikeTemperature`,
      value: obs.outside.feelsLikeTemperature
    })
  }
  if (typeof obs.outside?.pressure !== 'undefined') {
    deltaValues.push({
      path: `${pathRoot}.outside.pressure`,
      value: obs.outside.pressure
    })
  }
  if (typeof obs.outside?.relativeHumidity !== 'undefined') {
    deltaValues.push({
      path: `${pathRoot}.outside.relativeHumidity`,
      value: obs.outside.relativeHumidity
    })
  }
  if (typeof obs.outside?.absoluteHumidity !== 'undefined') {
    deltaValues.push({
      path: `${pathRoot}.outside.absoluteHumidity`,
      value: obs.outside.absoluteHumidity
    })
  }
  if (typeof obs.outside?.precipitationType !== 'undefined') {
    deltaValues.push({
      path: `${pathRoot}.outside.precipitationType`,
      value: obs.outside.precipitationType
    })
  }
  if (typeof obs.wind?.speedTrue !== 'undefined') {
    deltaValues.push({
      path: `${pathRoot}.wind.speedTrue`,
      value: obs.wind.speedTrue
    })
  }
  if (typeof obs.wind?.directionTrue !== 'undefined') {
    deltaValues.push({
      path: `${pathRoot}.wind.directionTrue`,
      value: obs.wind.directionTrue
    })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updates: any = {
    values: deltaValues
  }

  server.handleMessage(
    pluginId,
    {
      context: `meteo.${weatherServiceName.toLocaleLowerCase()}`,
      updates: [updates]
    },
    SKVersion.v1
  )
}
