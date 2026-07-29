import { MOCK_WEATHER } from "@/lib/mock-data";

export const metadata = { title: "Weather" };

export default function WeatherPage() {
  return (
    <section className="container-editorial py-10">
      <h1 className="mb-2 font-display text-2xl font-bold text-ink">Weather</h1>
      <p className="mb-8 max-w-prose text-ink-soft">
        Current conditions and alerts for major cities, refreshed throughout the day. Extreme weather
        events also appear in Breaking News.
      </p>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {MOCK_WEATHER.map((w) => (
          <div key={w.location} className="rounded-xl2 border border-sand/40 bg-card p-5 shadow-card">
            <p className="font-display text-lg font-semibold text-ink">{w.location}</p>
            <p className="mt-1 text-3xl font-semibold text-ink">{w.temperatureC}°C</p>
            <p className="text-sm text-ink-soft">{w.condition}</p>
            <dl className="mt-4 space-y-1 text-xs text-ink-soft">
              <div className="flex justify-between">
                <dt>Humidity</dt>
                <dd>{w.humidityPercent}%</dd>
              </div>
              <div className="flex justify-between">
                <dt>Wind</dt>
                <dd>{w.windKph} km/h</dd>
              </div>
            </dl>
            {w.alert && (
              <p className="mt-3 rounded-lg bg-peach/70 px-3 py-2 text-xs font-medium text-terracotta">
                ⚠ {w.alert}
              </p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
