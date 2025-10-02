# OpenWeather provider plugin for Signal K server

__Signal K Server plugin for integrating the OpenWeather service with the `Weather API`__.



## Description

This plugin is a Signal K weather provider which communicates with the OpenWeather API to expose weather data under the path `/signalk/v2/api/weather` _(see the Signal K Server documentation for details)_.

Requests to OpenWeather are made using the API key supplied in the plugin configuration.

>Note: An OpenWeather v3 API key is required to be able to use this plugin.

**Supported Signal K Weather API options:**
- `count` Up to 48 Forecast entries, N/A for Observations (only the most current observation is returned [count=1]). 
- `date` Not supported

### Polling
The plugin can be configured to poll OpenWeather at regular intervals with the vessel's current location and make the data available in both the Signal K:

- Weather API `/signalk/v2/api/weather`
- Data model `/signalk/v1/api/meteo/openweather`.

### Data Cache
Data returned from OpenWeather is cached by the plugin to reduce the number of requests made to the service over the Internet connection.

The cache is refreshed periodically to ensure the most recent data is available.
The cache data is checked for refresh whenever:
1. A request is received for a location within the cached area
1. The age of the cached data >= `poll interval` specified in the plugin configuration.


## Configuration

From the Signal K server `Admin` console:
-  Select **Server** -> **Plugin Config**

-  From the list of plugins select `OpenWeather (Weather Provider)`  to display the details screen.

- Enter an _OpenWeather API Key_. This is required to use the OpenWeather API.

- Check _Poll periodically using vessel position_ to regularly fetch weather data for the vessel's current posiition.

- Select the polling interval. _(Note: This is also used as the maximum age for cache data.)_


## Requirements

- Signal K Server that implements the `Weather API`.


