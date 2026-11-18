import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../ui/base.css';
import './calibration.css';
import { CalibrationApp } from './CalibrationApp';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <CalibrationApp />
  </StrictMode>,
);
