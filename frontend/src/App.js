import React from 'react';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import Dashboard from './components/Dashboard';

export default function App(){
  return (
    <Container maxWidth="lg" sx={{mt:4}}>
      <Typography variant="h4" gutterBottom>Smart AI Inventory Dashboard</Typography>
      <Dashboard />
    </Container>
  );
}
