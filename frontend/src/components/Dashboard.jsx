import React, { useEffect, useState } from 'react';
import { Box, Button, Paper, Grid, TextField, Typography } from '@mui/material';
import StockTable from './StockTable';
import ForecastChart from './ForecastChart';
import api from '../config/axios';

export default function Dashboard() {
  const [products, setProducts] = useState([]);
  const [selected, setSelected] = useState(null);
  const [recentWindow, setRecentWindow] = useState([]);
  const [forecast, setForecast] = useState(null);
  const [loadingProducts, setLoadingProducts] = useState(true);

  useEffect(() => { fetchProducts(); }, []);

  async function fetchProducts() {
    try {
      setLoadingProducts(true);
      const r = await api.get('/api/products');
      setProducts(r.data);
    } catch (err) {
      console.error('Fetch products error:', err);
    } finally {
      setLoadingProducts(false);
    }
  }

  async function select(p) {
    setSelected(p);
    setForecast(null);

    try {
      const r = await api.get(`/api/forecast/recent-window/${encodeURIComponent(p.product_id)}`);
      setRecentWindow(r.data.recent_window || []);
    } catch (err) {
      console.error('Fetch recent window error:', err);
      setRecentWindow([]);
    }
  }

  async function doPredict() {
    if (!selected || recentWindow.length === 0) return alert('Pilih produk dulu');
    try {
      const r = await api.post('/api/forecast/predict', {
        product_name: selected.name,
        recent_window: recentWindow
      });
      setForecast(r.data.forecast_next);
    } catch (err) {
      console.error('Forecast error:', err);
    }
  }

  async function syncProducts() {
    try {
      await api.post('/api/products/sync');
      fetchProducts();
    } catch (err) {
      console.error('Sync products error:', err);
    }
  }

  async function syncSales() {
    try {
      await api.post('/api/sales/sync');
    } catch (err) {
      console.error('Sync sales error:', err);
    }
  }

  return (
    <Grid container spacing={2}>
      <Grid item xs={12} md={6}>
        <Paper sx={{ p: 2 }}>
          <Typography variant="h6">Products</Typography>
          {loadingProducts ? (
            <Typography>Loading products...</Typography>
          ) : (
            <StockTable products={products} onSelect={select} />
          )}
          <Box sx={{ mt: 2 }}>
            <Button variant="contained" onClick={syncProducts}>Sync Products</Button>
            <Button sx={{ ml: 2 }} variant="outlined" onClick={syncSales}>Sync Sales</Button>
          </Box>
        </Paper>
      </Grid>

      <Grid item xs={12} md={6}>
        <Paper sx={{ p: 2 }}>
          <Typography variant="h6">Forecast</Typography>
          <Typography variant="body2">Selected: {selected ? selected.name : '-'}</Typography>
          <TextField
            label="Recent Window (auto fetch last 14 days)"
            fullWidth
            value={recentWindow.join(', ')}
            onChange={e => setRecentWindow(e.target.value.split(',').map(x=>Number(x.trim()).filter(n=>!isNaN(n))))}
            sx={{ mt: 2 }}
          />
          <Button variant="contained" sx={{ mt: 2 }} onClick={doPredict}>Predict Next Day</Button>
          {forecast !== null && (
            <Typography sx={{ mt: 2 }}>Forecast next: {forecast.toFixed(2)}</Typography>
          )}
           <Typography variant="body2">Selected: {selected ? selected.name : '-'}</Typography>
          <ForecastChart recentWindow={recentWindow} forecast={forecast} />
        </Paper>
      </Grid>
    </Grid>
  );
}
