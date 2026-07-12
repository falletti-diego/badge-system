/**
 * TrendChart — grafico a linea delle presenze giornaliere (ultimi 30 giorni)
 */

import React from 'react';
import { Card, CircularProgress, Alert } from '@mui/material';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer,
} from 'recharts';

const NAVY = '#1E3A5F';

const formatDayLabel = (dateStr) => {
  const d = new Date(`${dateStr}T00:00:00Z`);
  return d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', timeZone: 'UTC' });
};

const TrendChart = ({ days = [], loading = false, error = null }) => {
  const chartData = days.map((d) => ({ ...d, label: formatDayLabel(d.date) }));

  return (
    <Card
      sx={{
        padding: '24px',
        marginBottom: '24px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
      }}
    >
      <p className="text-sm font-dm-sans text-stone-600 mb-4">Presenze giornaliere (ultimi 30 giorni)</p>

      {loading && (
        <div className="flex justify-center py-8">
          <CircularProgress size={28} sx={{ color: NAVY }} />
        </div>
      )}

      {!loading && error && <Alert severity="error">{error}</Alert>}

      {!loading && !error && (
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E5E1DA" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
            <Tooltip />
            <Line type="monotone" dataKey="presenze" stroke={NAVY} strokeWidth={2} dot={false} name="Presenze" />
          </LineChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
};

export default TrendChart;
