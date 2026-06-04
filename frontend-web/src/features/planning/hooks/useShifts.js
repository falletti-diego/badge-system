import { useState, useEffect } from 'react';

// Generate mock shifts for a given month/year
const generateMockShifts = (month, year) => {
  const daysInMonth = new Date(year, month, 0).getDate();
  const shifts = {};

  // Generate shifts for each employee across the month
  const employees = [
    { id: 'emp-1', name: 'Diego Falletti', email: 'diego@badge.local' },
    { id: 'emp-2', name: 'Luca Verdi', email: 'luca@badge.local' },
    { id: 'emp-3', name: 'Marco Rossi', email: 'marco@badge.local' },
    { id: 'emp-4', name: 'Anna Bianchi', email: 'anna@badge.local' },
  ];

  const shiftPattern = ['m', 'p', 's', 'R'];

  employees.forEach(emp => {
    shifts[emp.id] = {};
    // FIXED: Generate turni solo per giugno (month=6), altri mesi vuoti
    if (month === 6) {
      for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        shifts[emp.id][dateStr] = shiftPattern[(day - 1) % 4];
      }
    }
    // Altrimenti shifts[emp.id] rimane {}
  });

  return {
    site: { id: 'site-1', name: 'Store Torino' },
    employees,
    shifts_data: shifts,
    metadata: { employee_count: employees.length }
  };
};

export const useShifts = (siteId, month, year) => {
  // FIXED: Use useEffect to regenerate data when month/year change (not just once)
  const [data, setData] = useState(null);
  const [loading] = useState(false);
  const [error] = useState(null);

  useEffect(() => {
    if (month && year) {
      const mockData = generateMockShifts(month, year);
      setData(mockData);
      console.log(`📊 Shifts generated for ${month}/${year}:`, mockData);
    }
  }, [month, year]);

  return { data, loading, error };
};
