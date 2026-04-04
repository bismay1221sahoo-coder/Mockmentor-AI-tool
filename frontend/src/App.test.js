import { render, screen } from '@testing-library/react';
import App from './App';

test('renders app brand title', () => {
  render(<App />);
  const brandTitle = screen.getByText(/mockmentor ai/i);
  expect(brandTitle).toBeInTheDocument();
});
