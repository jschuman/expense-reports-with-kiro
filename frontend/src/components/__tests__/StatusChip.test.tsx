/**
 * Unit tests for StatusChip component.
 * Validates: Requirements 1.7
 *
 * Covers:
 *  - Each known status value maps to the correct chip color
 *  - Unknown status values render with default color
 *  - The chip label displays the status text
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatusChip } from '../StatusChip';

describe('StatusChip', () => {
  // ---------------------------------------------------------------------------
  // Status-to-color mappings
  // ---------------------------------------------------------------------------

  describe('status-to-color mappings', () => {
    it('renders "In Progress" with default color', () => {
      const { container } = render(<StatusChip status="In Progress" />);
      const chip = container.querySelector('.MuiChip-root');
      expect(chip).toHaveClass('MuiChip-colorDefault');
    });

    it('renders "Submitted" with primary color', () => {
      const { container } = render(<StatusChip status="Submitted" />);
      const chip = container.querySelector('.MuiChip-root');
      expect(chip).toHaveClass('MuiChip-colorPrimary');
    });

    it('renders "Scheduled for Payment" with success color', () => {
      const { container } = render(<StatusChip status="Scheduled for Payment" />);
      const chip = container.querySelector('.MuiChip-root');
      expect(chip).toHaveClass('MuiChip-colorSuccess');
    });

    it('renders "Rejected" with error color', () => {
      const { container } = render(<StatusChip status="Rejected" />);
      const chip = container.querySelector('.MuiChip-root');
      expect(chip).toHaveClass('MuiChip-colorError');
    });
  });

  // ---------------------------------------------------------------------------
  // Unknown status values default to 'default' color
  // ---------------------------------------------------------------------------

  describe('unknown status values', () => {
    it('renders an unknown status with default color', () => {
      const { container } = render(<StatusChip status="SomeUnknownStatus" />);
      const chip = container.querySelector('.MuiChip-root');
      expect(chip).toHaveClass('MuiChip-colorDefault');
    });

    it('renders an empty string status with default color', () => {
      const { container } = render(<StatusChip status="" />);
      const chip = container.querySelector('.MuiChip-root');
      expect(chip).toHaveClass('MuiChip-colorDefault');
    });
  });

  // ---------------------------------------------------------------------------
  // Chip label displays the status text
  // ---------------------------------------------------------------------------

  describe('chip label', () => {
    it('displays "In Progress" as the label', () => {
      render(<StatusChip status="In Progress" />);
      expect(screen.getByText('In Progress')).toBeInTheDocument();
    });

    it('displays "Submitted" as the label', () => {
      render(<StatusChip status="Submitted" />);
      expect(screen.getByText('Submitted')).toBeInTheDocument();
    });

    it('displays "Scheduled for Payment" as the label', () => {
      render(<StatusChip status="Scheduled for Payment" />);
      expect(screen.getByText('Scheduled for Payment')).toBeInTheDocument();
    });

    it('displays "Rejected" as the label', () => {
      render(<StatusChip status="Rejected" />);
      expect(screen.getByText('Rejected')).toBeInTheDocument();
    });

    it('displays an arbitrary status string as the label', () => {
      render(<StatusChip status="Custom Status" />);
      expect(screen.getByText('Custom Status')).toBeInTheDocument();
    });
  });
});
