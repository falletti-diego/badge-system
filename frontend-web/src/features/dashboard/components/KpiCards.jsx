/**
 * KPI Cards Component
 * Displays 4 key performance indicator cards: total, employees, IN, OUT
 */

import React from 'react';
import { Card } from '@mui/material';

const KpiCards = ({ stats = {} }) => {
  const {
    total_checkins = 0,
    unique_employees = 0,
    checkin_types = { IN: 0, OUT: 0 },
  } = stats;

  const cards = [
    {
      id: 'total',
      label: 'Total Check-ins',
      value: total_checkins,
      icon: '📊',
      bgColor: '#EEF2F7',
      borderColor: '#1E3A5F',
      textColor: '#1E3A5F',
    },
    {
      id: 'employees',
      label: 'Unique Employees',
      value: unique_employees,
      icon: '👥',
      bgColor: '#EEF2F7',
      borderColor: '#1E3A5F',
      textColor: '#1E3A5F',
    },
    {
      id: 'in',
      label: 'Check-ins IN',
      value: checkin_types?.IN || 0,
      icon: '✅',
      bgColor: '#EEF6F1',
      borderColor: '#2D7049',
      textColor: '#2D7049',
    },
    {
      id: 'out',
      label: 'Check-ins OUT',
      value: checkin_types?.OUT || 0,
      icon: '🔚',
      bgColor: '#FEF6EC',
      borderColor: '#B45309',
      textColor: '#B45309',
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {cards.map((card) => (
        <Card
          key={card.id}
          sx={{
            padding: '24px',
            backgroundColor: card.bgColor,
            borderLeft: `4px solid ${card.borderColor}`,
            boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
            transition: 'box-shadow 0.2s ease',
            '&:hover': {
              boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
            },
          }}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-dm-sans text-stone-600 mb-2">{card.label}</p>
              <p
                className="text-4xl font-cormorant font-bold"
                style={{ color: card.textColor }}
              >
                {card.value}
              </p>
            </div>
            <span className="text-4xl">{card.icon}</span>
          </div>
        </Card>
      ))}
    </div>
  );
};

export default KpiCards;
