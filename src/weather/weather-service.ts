import {
  SKVersion,
  Position,
  WeatherData,
  WeatherForecastType,
  WeatherReqParams,
  WeatherWarning,
  Context
} from '@signalk/server-api'
import { OpenWeatherProviderApp } from '..'
import { OpenWeather } from './openweather'

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
const errorCountMax = 5 // max number of consecutive errors before terminating timer
let errorCount = 0 // number of consecutive fetch errors (no position / failed api connection, etc)

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
  errorCount = 0
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

  weatherService = new OpenWeather(app, config, server.getDataDirPath())

  if (config.enable) {
    if (!timer) {
      setTimeout(() => {
        server.debug(`*** Weather: startTimer..`)
        timer = setInterval(() => pollWeatherData(), wakeInterval)
        pollWeatherData()
      }, 3000)
    }
  }
}

/**
 * Stop timers and clean up
 */
export const stopWeather = () => {
  if (timer) {
    clearInterval(timer)
  }
  timer = null
  lastFetch = fetchInterval - 1
  lastWake = 0
}

/** Fetch data at current vessel position at specified interval. */
const pollWeatherData = async () => {
  // runaway check
  if (lastWake > 0) {
    const dt = Date.now() - lastWake
    const flagValue = wakeInterval - 10000
    if (dt < flagValue) {
      server.debug(
        `Watchdog -> Awake!...(${dt / 1000} secs)... stopping timer...`
      )
      stopWeather()
      server.setPluginError('Weather timer stopped by watchdog!')
      return
    }
  }
  lastWake = Date.now()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pos: any = server.getSelfPath('navigation.position')
  if (!pos) {
    handleError(`*** Weather: No vessel position detected!`)
    return
  }

  server.debug(`*** Vessel position: ${JSON.stringify(pos.value)}.`)
  // check if fetchInterval has lapsed
  if (lastFetch) {
    const e = Date.now() - lastFetch
    if (e < fetchInterval) {
      server.debug(
        `*** Weather: Next poll due in ${Math.round(
          (fetchInterval - e) / 60000
        )} min(s)... sleeping for ${wakeInterval / 1000} seconds...`
      )
      return
    }
  }

  if (errorCount < errorCountMax) {
    server.debug(`*** Weather: Calling service API.....`)
    server.debug(`Position: ${JSON.stringify(pos.value)}`)
    server.debug(`*** Weather: polling weather provider.`)
    weatherService
      .fetchObservations(pos.value, undefined, true)
      .then((obs) => {
        server.debug(`*** Weather: data received....`)
        server.debug(JSON.stringify(obs))
        errorCount = 0
        lastFetch = Date.now()
        lastWake = Date.now()
        emitMeteoDeltas(pos.value, obs[0])
      })
      .catch((err) => {
        handleError(`*** Weather: ERROR polling weather provider!`)
        console.log(err.message)
        server.setPluginError(err.message)
      })
  }
}

/**
 * Handle fetch errors
 * @param msg mesgage to log
 */
const handleError = (msg: string) => {
  console.log(msg)
  errorCount++
  if (errorCount >= errorCountMax) {
    // max retries exceeded.... going to sleep
    console.log(
      `*** Weather: Failed to fetch data after ${errorCountMax} attempts.\nRestart ${pluginId} plugin to retry.`
    )
    stopWeather()
  } else {
    console.log(`*** Weather: Error count = ${errorCount} of ${errorCountMax}`)
    console.log(`*** Retry in  ${wakeInterval / 1000} seconds.`)
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
      context: `meteo.${weatherServiceName.toLocaleLowerCase()}` as Context,
      updates: [updates]
    },
    SKVersion.v1
  )
}
