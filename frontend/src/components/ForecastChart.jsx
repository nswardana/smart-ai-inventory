import React from 'react';
import { Line } from 'react-chartjs-2';
import { Box, Typography } from '@mui/material';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

export default function ForecastChart({ recentWindow, forecast }) {
  if (!recentWindow || recentWindow.length === 0) return null;

  const labels = [...recentWindow.map((_,i)=>`Day ${i+1}`), 'Next Day'];
  const data = {
    labels,
    datasets: [
      {
        label: 'Demand',
        data: [...recentWindow, forecast || null],
        borderColor: 'rgb(75,192,192)',
        backgroundColor: 'rgba(75,192,192,0.2)',
        tension: 0.3,
        fill: true,
      }
    ]
  };

  const options = {
    responsive: true,
    plugins: {
      legend: { position: 'top' },
      title: { display: true, text: 'Demand Forecast Trend' }
    },
    scales: {
      y: { beginAtZero: true }
    }
  };

  return (
    <Box sx={{ mt:2 }}>
      <Typography variant="subtitle2">Forecast Trend</Typography>
      <Line data={data} options={options} />
    </Box>
  );
}
