// StockTable.js
import React, { useEffect, useState } from 'react';
import {
  Table,
  TableBody,
  TableRow,
  TableCell,
  TableHead,
  TablePagination,
  TableContainer,
  Paper,
  TextField,
  Button,
  CircularProgress,
  Box
} from '@mui/material';
import api from '../config/axios';

export default function StockTable({ products, onSelect }) {
  const [filter, setFilter] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  // filter produk berdasarkan nama
  const filteredProducts = products.filter((p) =>
    p.name.toLowerCase().includes(filter.toLowerCase())
  );

  const handleChangePage = (event, newPage) => setPage(newPage);
  const handleChangeRowsPerPage = (event) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  return (
    <Paper sx={{ p: 1 }}>
      <Box sx={{ mb: 1, display: 'flex', gap: 1 }}>
        <TextField
          label="Filter product"
          size="small"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          fullWidth
        />
        <Button variant="outlined" onClick={() => setFilter('')}>Reset</Button>
      </Box>
      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Product</TableCell>
              <TableCell>Qty</TableCell>
              <TableCell>Warehouse</TableCell>
              <TableCell></TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredProducts
              .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
              .map((p) => (
                <TableRow key={p.external_id}>
                  <TableCell>{p.name}</TableCell>
                  <TableCell>{p.qty}</TableCell>
                  <TableCell>{p.warehouse}</TableCell>
                  <TableCell>
                    <Button size="small" variant="outlined" onClick={() => onSelect(p)}>
                      Select
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </TableContainer>
      <TablePagination
        component="div"
        count={filteredProducts.length}
        page={page}
        onPageChange={handleChangePage}
        rowsPerPage={rowsPerPage}
        onRowsPerPageChange={handleChangeRowsPerPage}
        rowsPerPageOptions={[5, 10, 25, 50]}
      />
    </Paper>
  );
}
