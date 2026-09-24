import { render, screen } from '@testing-library/react';
import App from './App';

test('renders the speech-to-sign application shell', () => {
  render(<App />);
  expect(screen.getByRole('heading', { name: /speech-to-sign translation/i })).toBeInTheDocument();
});
