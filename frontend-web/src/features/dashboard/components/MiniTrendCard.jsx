/**
 * MiniTrendCard — mini-grafico a linea riusabile per una singola metrica
 * (ore lavorate, ore straordinarie, assenteismo %), con il valore
 * dell'ultimo giorno come cifra in evidenza.
 */

import React from 'react';
import { Card } from '@mui/material';
import { LineChart, Line, ResponsiveContainer } from 'recharts';

const MiniTrendCard = ({ title, dataKey, days = [], color, suffix = '' }) => {
  const lastValue = days.length > 0 ? days[days.length - 1][dataKey] : 0;
  const chartLabel = `Andamento ${title}: valore attuale ${lastValue}${suffix}`;

  return (
    <Card
      sx={{
        padding: '20px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
      }}
    >
      <p className="text-sm font-dm-sans text-stone-600 mb-2">{title}</p>
      <p className="text-2xl font-cormorant font-bold mb-2" style={{ color }}>
        {lastValue}{suffix}
      </p>
      {days.length > 0 && (
        <div role="img" aria-label={chartLabel}>
          <ResponsiveContainer width="100%" height={48}>
            <LineChart data={days}>
              <Line type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
};

export default MiniTrendCard;
