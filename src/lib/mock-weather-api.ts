// *********** Delete after @signalk/server-api release ************

import { Position } from '@signalk/server-api'

export interface WeatherApi {
  register: (pluginId: string, provider: WeatherProvider) => void
  unRegister: (pluginId: string) => void
}

export interface WeatherProviderRegistry {
  /**
   * Used by _Weather Provider plugins_ to register the weather service from which the data is sourced.
   * See [`Weather Provider Plugins`](../../../docs/develop/plugins/weather_provider_plugins.md#registering-as-a-weather-provider) for details.
   *
   * @category Weather API
   */
  registerWeatherProvider: (provider: WeatherProvider) => void
}

/**
 * @hidden visible through ServerAPI
 */
export interface WeatherProviders {
  [id: string]: {
    name: string
    isDefault: boolean
  }
}

/**
 * @hidden visible through ServerAPI
 * @see {isWeatherProvider} ts-auto-guard:type-guard */
export interface WeatherProvider {
  name: string // e.g. OpenWeather, Open-Meteo, NOAA
  methods: WeatherProviderMethods
}

export interface WeatherProviderMethods {
  pluginId?: string

  /**
   * Retrieves observation data from the weather provider for the supplied position.
   *
   * @category Weather API
   * 
   * @param position Location of interest 
   * @param options Options
   * 
   * @example
    ```javascript
    getObservations({latitude: 16.34765, longitude: 12.5432}, 1);
    ```

    ```JSON
    [
        {
            "date": "2024-05-03T06:00:00.259Z",
            "type": "observation",
            "outside": { ... }
        },
        {
            "date": "2024-05-03T05:00:00.259Z",
            "type": "observation",
            "outside": { ... }
        }
    ]
    ```
  */
  getObservations: (
    position: Position,
    options?: {
      maxCount?: number
      startDate?: string
    }
  ) => Promise<WeatherData[]>

  /**
   * Retrieves forecast data from the weather provider for the supplied position, forecast type and number of intervals.
   *
   * @category Weather API
   * 
   * @param position Location of interest 
   * @param type Type of forecast point | daily
   * @param options Options
   * 
   * @example
   * Retrieve point forecast data for the next eight point intervalss
    ```javascript
    getForecasts({latitude: 16.34765, longitude: 12.5432}, 'point', 8);
    ```

    ```JSON
    [
        {
            "date": "2024-05-03T06:00:00.259Z",
            "type": "point",
            "outside": { ... }
        },
        {
            "date": "2024-05-03T05:00:00.259Z",
            "type": "point",
            "outside": { ... }
        }
    ]
    ```
  */
  getForecasts: (
    position: Position,
    type: WeatherForecastType,
    options?: {
      maxCount?: number
      startDate?: string
    }
  ) => Promise<WeatherData[]>

  /**
   * Retrieves warning data from the weather provider for the supplied position.
   *
   * @category Weather API
   * 
   * @param position Location of interest 
   *
   * @example
    ```javascript
    getWarnings({latitude: 16.34765, longitude: 12.5432});
    ```

    ```JSON
    [
      {
        "startTime": "2024-05-03T05:00:00.259Z",
        "endTime": "2024-05-03T08:00:00.702Z",
        "details": "Strong wind warning.",
        "source": "MyWeatherService",
        "type": "Warning"
      }
    ]
    ```
  */
  getWarnings: (position: Position) => Promise<WeatherWarning[]>
}

export interface WeatherWarning {
  startTime: string
  endTime: string
  details: string
  source: string
  type: string
}

/**
 * @hidden visible through ServerAPI
 */
export interface WeatherReqParams {
  maxCount?: number
  startDate?: string
}

/**
 * @hidden visible through ServerAPI
 */
export type WeatherForecastType = 'daily' | 'point'
/**
 * @hidden visible through ServerAPI
 */
export type WeatherDataType = WeatherForecastType | 'observation'

// Aligned with Signal K environment specification
/**
 * @hidden visible through ServerAPI
 */
export interface WeatherData {
  description?: string
  date: string
  type: WeatherDataType // daily forecast, point-in-time forecast, observed values
  outside?: {
    minTemperature?: number
    maxTemperature?: number
    feelsLikeTemperature?: number
    precipitationVolume?: number
    absoluteHumidity?: number
    horizontalVisibility?: number
    uvIndex?: number
    cloudCover?: number
    temperature?: number
    dewPointTemperature?: number
    pressure?: number
    pressureTendency?: TendencyKind
    relativeHumidity?: number
    precipitationType?: PrecipitationKind
  }
  water?: {
    temperature?: number
    level?: number
    levelTendency?: TendencyKind
    surfaceCurrentSpeed?: number
    surfaceCurrentDirection?: number
    salinity?: number
    waveSignificantHeight?: number
    wavePeriod?: number
    waveDirection?: number
    swellHeight?: number
    swellPeriod?: number
    swellDirection?: number
  }
  wind?: {
    speedTrue?: number
    directionTrue?: number
    gust?: number
    gustDirection?: number
  }
  sun?: {
    sunrise?: string
    sunset?: string
  }
}

/**
 * @hidden visible through ServerAPI
 */
export type TendencyKind =
  | 'steady'
  | 'decreasing'
  | 'increasing'
  | 'not available'

/**
 * @hidden visible through ServerAPI
 */
export type PrecipitationKind =
  | 'reserved'
  | 'rain'
  | 'thunderstorm'
  | 'freezing rain'
  | 'mixed/ice'
  | 'snow'
  | 'reserved'
  | 'not available'
