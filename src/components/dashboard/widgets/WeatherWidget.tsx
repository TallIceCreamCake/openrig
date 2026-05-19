import React from 'react';
import { Cloud, Sun, CloudRain, CloudSnow, Wind } from 'lucide-react';
import WidgetCard from '../WidgetCard';
import { useTranslation } from '../../../context/TranslationContext';

interface WeatherData {
  location: string;
  temperature: number;
  condition: 'sunny' | 'cloudy' | 'rainy' | 'snowy' | 'windy';
  humidity: number;
  windSpeed: number;
  forecast: Array<{
    day: string;
    temp: number;
    condition: string;
  }>;
}

interface WeatherWidgetProps {
  weather: WeatherData;
}

const WeatherWidget: React.FC<WeatherWidgetProps> = ({ weather }) => {
  const { t } = useTranslation();
  const getWeatherIcon = (condition: string) => {
    switch (condition) {
      case 'sunny':
        return <Sun className="h-8 w-8 text-yellow-500" />;
      case 'cloudy':
        return <Cloud className="h-8 w-8 text-gray-500" />;
      case 'rainy':
        return <CloudRain className="h-8 w-8 text-blue-500" />;
      case 'snowy':
        return <CloudSnow className="h-8 w-8 text-blue-300" />;
      case 'windy':
        return <Wind className="h-8 w-8 text-gray-600" />;
      default:
        return <Sun className="h-8 w-8 text-yellow-500" />;
    }
  };

  const getConditionText = (condition: string) => {
    switch (condition) {
      case 'sunny':
        return t('dashboard.widgets.weather.conditions.sunny');
      case 'cloudy':
        return t('dashboard.widgets.weather.conditions.cloudy');
      case 'rainy':
        return t('dashboard.widgets.weather.conditions.rainy');
      case 'snowy':
        return t('dashboard.widgets.weather.conditions.snowy');
      case 'windy':
        return t('dashboard.widgets.weather.conditions.windy');
      default:
        return t('dashboard.widgets.weather.conditions.sunny');
    }
  };

  return (
    <WidgetCard title={t('dashboard.widgets.weather.title')}>
      <div className="space-y-4">
        <div className="text-center">
          <div className="flex items-center justify-center mb-2">
            {getWeatherIcon(weather.condition)}
          </div>
          <p className="text-2xl font-bold text-gray-900">{weather.temperature}°C</p>
          <p className="text-sm text-gray-600">{getConditionText(weather.condition)}</p>
          <p className="text-xs text-gray-500">{weather.location}</p>
        </div>
        
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="bg-blue-50 p-2 rounded">
            <p className="text-blue-600 font-medium">{t('dashboard.widgets.weather.humidity')}</p>
            <p className="text-blue-900 font-semibold">{weather.humidity}%</p>
          </div>
          <div className="bg-gray-50 p-2 rounded">
            <p className="text-gray-600 font-medium">{t('dashboard.widgets.weather.wind')}</p>
            <p className="text-gray-900 font-semibold">{weather.windSpeed} km/h</p>
          </div>
        </div>
        
        <div className="border-t pt-3">
          <p className="text-xs font-medium text-gray-500 mb-2">{t('dashboard.widgets.weather.forecast')}</p>
          <div className="grid grid-cols-3 gap-2 text-xs">
            {weather.forecast.slice(0, 3).map((day, index) => (
              <div key={index} className="text-center">
                <p className="text-gray-600">{day.day}</p>
                <p className="font-semibold">{day.temp}°</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </WidgetCard>
  );
};

export default WeatherWidget;
