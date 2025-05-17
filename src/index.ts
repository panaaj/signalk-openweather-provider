import { Plugin, ServerAPI, SKVersion } from '@signalk/server-api'
import { Application } from 'express'

import {
  WEATHER_POLL_INTERVAL,
  WEATHER_CONFIG,
  initWeather,
  stopWeather
} from './weather/weather-service'

/**
 * @todo remove reference to mock-weather-api
 */
import { WeatherProviderRegistry } from './lib/mock-weather-api'
// *************************************************

const DEFAULT_POLL_INTERVAL = 60

const CONFIG_SCHEMA = {
  properties: {
    weather: {
      title: 'OpenWeather',
      type: 'object',
      description: 'Weather service settings.',
      properties: {
        apiKey: {
          type: 'string',
          title: 'API Key',
          default: '',
          description: 'Get your API key at https://openweather.org'
        },
        enable: {
          type: 'boolean',
          default: false,
          title: 'Poll periodcally using vessel position.'
        },
        pollInterval: {
          type: 'number',
          title: 'Polling Interval',
          default: 60,
          enum: WEATHER_POLL_INTERVAL,
          description:
            'Select the interval at which the weather service is polled.'
        }
      }
    }
  }
}

const CONFIG_UISCHEMA = {
  weather: {
    apiKey: {
      'ui:disabled': false,
      'ui-help': ''
    },
    enable: {
      'ui:widget': 'checkbox',
      'ui:title': ' ',
      'ui:help': ' '
    },
    pollInterval: {
      'ui:widget': 'select',
      'ui:title': 'Polling Interval (mins)',
      'ui:help': ' '
    }
  }
}

interface SETTINGS {
  weather: WEATHER_CONFIG
}

export interface OpenWeatherProviderApp
  extends Application,
    ServerAPI,
    WeatherProviderRegistry {}

module.exports = (server: OpenWeatherProviderApp): Plugin => {
  // ** default configuration settings
  let settings: SETTINGS = {
    weather: {
      enable: false,
      apiKey: '',
      pollInterval: DEFAULT_POLL_INTERVAL
    }
  }

  // ******** REQUIRED PLUGIN DEFINITION *******
  const plugin: Plugin = {
    id: 'openweather',
    name: 'OpenWeather (Weather Provider)',
    schema: () => CONFIG_SCHEMA,
    uiSchema: () => CONFIG_UISCHEMA,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    start: (settings: any) => {
      doStartup(settings)
    },
    stop: () => {
      doShutdown()
    }
  }
  // ************************************

  const doStartup = (options: SETTINGS) => {
    try {
      server.debug(`${plugin.name} starting.......`)

      if (typeof server.registerWeatherProvider !== 'function') {
        throw new Error(
          'Weather API is not available! Server upgrade required.'
        )
      }

      if (typeof options !== 'undefined') {
        settings = options
      }

      settings.weather = options.weather ?? {
        enable: false,
        apiKey: '',
        pollInterval: DEFAULT_POLL_INTERVAL
      }
      settings.weather.enable = options.weather.enable ?? false
      settings.weather.apiKey = options.weather.apiKey ?? ''
      settings.weather.pollInterval =
        options.weather.pollInterval ?? DEFAULT_POLL_INTERVAL

      server.debug(`Applied config: ${JSON.stringify(settings)}`)

      initWeather(server, plugin.id, settings.weather)
      emitMeteoMetas()

      server.setPluginStatus(`Started`)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      const msg = 'Started with errors!'
      server.setPluginError(error.message ?? msg)
      server.error('** EXCEPTION: **')
      server.error(error.stack)
      return error
    }
  }

  const doShutdown = () => {
    server.debug('** shutting down **')
    stopWeather()
    server.debug('** Un-subscribing from events **')
    const msg = 'Stopped'
    server.setPluginStatus(msg)
  }

  const emitMeteoMetas = () => {
    const pathRoot = 'environment'
    const metas = []
    server.debug('**** METEO - building observation metas *****')
    metas.push({
      path: `${pathRoot}.date`,
      value: {
        description: 'Time of measurement.'
      }
    })
    metas.push({
      path: `${pathRoot}.sun.sunrise`,
      value: {
        description: 'Time of sunrise at the related position.'
      }
    })
    metas.push({
      path: `${pathRoot}.sun.sunset`,
      value: {
        description: 'Time of sunset at the related position.'
      }
    })
    metas.push({
      path: `${pathRoot}.outside.uvIndex`,
      value: {
        description: 'Level of UV radiation. 1 UVI = 25mW/sqm',
        units: 'UVI'
      }
    })
    metas.push({
      path: `${pathRoot}.outside.cloudCover`,
      value: {
        description: 'Cloud clover.',
        units: 'ratio'
      }
    })
    metas.push({
      path: `${pathRoot}.outside.temperature`,
      value: {
        description: 'Outside air temperature.',
        units: 'K'
      }
    })
    metas.push({
      path: `${pathRoot}.outside.dewPointTemperature`,
      value: {
        description: 'Dew point.',
        units: 'K'
      }
    })
    metas.push({
      path: `${pathRoot}.outside.feelsLikeTemperature`,
      value: {
        description: 'Feels like temperature.',
        units: 'K'
      }
    })
    metas.push({
      path: `${pathRoot}.outside.horizontalVisibility`,
      value: {
        description: 'Horizontal visibility.',
        units: 'm'
      }
    })
    metas.push({
      path: `${pathRoot}.outside.horizontalVisibilityOverRange`,
      value: {
        description:
          'Visibilty distance is greater than the range of the measuring equipment.'
      }
    })
    metas.push({
      path: `${pathRoot}.outside.pressure`,
      value: {
        description: 'Barometric pressure.',
        units: 'Pa'
      }
    })
    metas.push({
      path: `${pathRoot}.outside.pressureTendency`,
      value: {
        description:
          'Integer value indicating barometric pressure value tendency e.g. 0 = steady, etc.'
      }
    })

    metas.push({
      path: `${pathRoot}.outside.pressureTendencyType`,
      value: {
        description:
          'Description for the value of pressureTendency e.g. steady, increasing, decreasing.'
      }
    })
    metas.push({
      path: `${pathRoot}.outside.relativeHumidity`,
      value: {
        description: 'Relative humidity.',
        units: 'ratio'
      }
    })
    metas.push({
      path: `${pathRoot}.outside.absoluteHumidity`,
      value: {
        description: 'Absolute humidity.',
        units: 'ratio'
      }
    })
    metas.push({
      path: `${pathRoot}.wind.averageSpeed`,
      value: {
        description: 'Average wind speed.',
        units: 'm/s'
      }
    })
    metas.push({
      path: `${pathRoot}.wind.speedTrue`,
      value: {
        description: 'True wind speed.',
        units: 'm/s'
      }
    })
    metas.push({
      path: `${pathRoot}.wind.directionTrue`,
      value: {
        description: 'The wind direction relative to true north.',
        units: 'rad'
      }
    })
    metas.push({
      path: `${pathRoot}.wind.gust`,
      value: {
        description: 'Maximum wind gust.',
        units: 'm/s'
      }
    })
    metas.push({
      path: `${pathRoot}.wind.gustDirectionTrue`,
      value: {
        description: 'Maximum wind gust direction.',
        units: 'rad'
      }
    })

    metas.push({
      path: `${pathRoot}.wind.gust`,
      value: {
        description: 'Maximum wind gust.',
        units: 'm/s'
      }
    })

    metas.push({
      path: `${pathRoot}.water.level`,
      value: {
        description: 'Water level.',
        units: 'm'
      }
    })

    metas.push({
      path: `${pathRoot}.water.levelTendency`,
      value: {
        description:
          'Integer value indicating water level tendency e.g. 0 = steady, etc.'
      }
    })

    metas.push({
      path: `${pathRoot}.water.levelTendencyType`,
      value: {
        description:
          'Description for the value of levelTendency e.g. steady, increasing, decreasing.'
      }
    })

    metas.push({
      path: `${pathRoot}.water.waves.significantHeight`,
      value: {
        description: 'Significant wave height.',
        units: 'm'
      }
    })

    metas.push({
      path: `${pathRoot}.water.waves.period`,
      value: {
        description: 'Wave period.',
        units: 'ms'
      }
    })

    metas.push({
      path: `${pathRoot}.water.waves.direction`,
      value: {
        description: 'Wave direction.',
        units: 'rad'
      }
    })

    metas.push({
      path: `${pathRoot}.water.swell.significantHeight`,
      value: {
        description: 'Significant swell height.',
        units: 'm'
      }
    })

    metas.push({
      path: `${pathRoot}.water.swell.period`,
      value: {
        description: 'Swell period.',
        units: 'ms'
      }
    })

    metas.push({
      path: `${pathRoot}.water.swell.directionTrue`,
      value: {
        description: 'Swell direction.',
        units: 'rad'
      }
    })

    server.handleMessage(
      plugin.id,
      {
        context: `meteo.openweather`,
        updates: [
          {
            meta: metas
          }
        ]
      },
      SKVersion.v1
    )
  }

  return plugin
}
