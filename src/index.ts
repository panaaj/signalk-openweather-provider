import { Plugin, ServerAPI, WeatherProviderRegistry } from '@signalk/server-api'
import { Application } from 'express'

import {
  WEATHER_POLL_INTERVAL,
  WEATHER_CONFIG,
  initWeather,
  stopWeather
} from './weather/weather-service'

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
          description: 'Get your API key at https://openweathermap.org'
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

  return plugin
}
