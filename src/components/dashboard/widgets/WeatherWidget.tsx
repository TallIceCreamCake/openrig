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
      <div className="space-y-3">
        <div className="rounded-xl border border-sky-100 bg-gradient-to-br from-sky-50/80 to-white p-4 flex items-center gap-4">
          <div className="h-14 w-14 rounded-2xl bg-white shadow-sm grid place-items-center flex-shrink-0">
            {getWeatherIcon(weather.condition)}
          </div>
          <div className="min-w-0">
            <p className="text-3xl font-bold text-gray-900 tabular-nums leading-none">{weather.temperature}°C</p>
            <p className="text-sm text-gray-600 mt-1">{getConditionText(weather.condition)}</p>
            <p className="text-xs text-gray-400 truncate">{weather.location}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-gray-100 bg-gray-50/60 px-3 py-2.5">
            <p className="text-xs text-gray-500">{t('dashboard.widgets.weather.humidity')}</p>
            <p className="text-sm font-semibold text-gray-900 tabular-nums mt-0.5">{weather.humidity}%</p>
          </div>
          <div className="rounded-xl border border-gray-100 bg-gray-50/60 px-3 py-2.5">
            <p className="text-xs text-gray-500">{t('dashboard.widgets.weather.wind')}</p>
            <p className="text-sm font-semibold text-gray-900 tabular-nums mt-0.5">{weather.windSpeed} km/h</p>
          </div>
        </div>

        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-2">{t('dashboard.widgets.weather.forecast')}</p>
          <div className="grid grid-cols-3 gap-2">
            {weather.forecast.slice(0, 3).map((day, index) => (
              <div key={index} className="rounded-xl border border-gray-100 py-2 text-center">
                <p className="text-xs text-gray-500">{day.day}</p>
                <p className="text-sm font-semibold text-gray-900 tabular-nums mt-0.5">{day.temp}°</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </WidgetCard>
  );
};

export default WeatherWidget;
