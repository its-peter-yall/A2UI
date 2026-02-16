// CourseFilter.test.tsx
// Tests for CourseFilter component rendering and interactions

// Validates filter pill rendering, active state styling, click callbacks,
// and sort selector functionality.

// @see: client/src/features/learning/CourseFilter.tsx
// @note: Tests accessibility attributes (role="tablist", aria-selected)

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { CourseFilter } from './CourseFilter';
import type { FilterStatus, SortField } from './CourseFilter';

describe('CourseFilter', () => {
  const defaultProps = {
    status: 'all' as FilterStatus,
    sortBy: 'updated_at' as SortField,
    onStatusChange: vi.fn(),
    onSortChange: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders all status filter pills', () => {
    render(<CourseFilter {...defaultProps} />);

    expect(screen.getByText('All')).toBeInTheDocument();
    expect(screen.getByText('In Progress')).toBeInTheDocument();
    expect(screen.getByText('Completed')).toBeInTheDocument();
  });

  it('renders all sort options', () => {
    render(<CourseFilter {...defaultProps} />);

    expect(screen.getByText('Recent')).toBeInTheDocument();
    expect(screen.getByText('Progress')).toBeInTheDocument();
    expect(screen.getByText('Date Created')).toBeInTheDocument();
  });

  it('marks active status pill with aria-selected', () => {
    render(<CourseFilter {...defaultProps} status="in_progress" />);

    const allPill = screen.getByText('All');
    const inProgressPill = screen.getByText('In Progress');
    const completedPill = screen.getByText('Completed');

    expect(inProgressPill).toHaveAttribute('aria-selected', 'true');
    expect(allPill).toHaveAttribute('aria-selected', 'false');
    expect(completedPill).toHaveAttribute('aria-selected', 'false');
  });

  it('marks active sort option with aria-selected', () => {
    render(<CourseFilter {...defaultProps} sortBy="progress_percent" />);

    const recentSort = screen.getByText('Recent');
    const progressSort = screen.getByText('Progress');
    const dateSort = screen.getByText('Date Created');

    expect(progressSort).toHaveAttribute('aria-selected', 'true');
    expect(recentSort).toHaveAttribute('aria-selected', 'false');
    expect(dateSort).toHaveAttribute('aria-selected', 'false');
  });

  it('click on status pill calls onStatusChange', () => {
    render(<CourseFilter {...defaultProps} />);

    fireEvent.click(screen.getByText('In Progress'));
    expect(defaultProps.onStatusChange).toHaveBeenCalledWith('in_progress');
    expect(defaultProps.onStatusChange).toHaveBeenCalledTimes(1);
  });

  it('click on sort option calls onSortChange', () => {
    render(<CourseFilter {...defaultProps} />);

    fireEvent.click(screen.getByText('Progress'));
    expect(defaultProps.onSortChange).toHaveBeenCalledWith('progress_percent');
    expect(defaultProps.onSortChange).toHaveBeenCalledTimes(1);
  });

  it('click on "Completed" calls onStatusChange with completed', () => {
    render(<CourseFilter {...defaultProps} />);

    fireEvent.click(screen.getByText('Completed'));
    expect(defaultProps.onStatusChange).toHaveBeenCalledWith('completed');
  });

  it('click on "Date Created" calls onSortChange with created_at', () => {
    render(<CourseFilter {...defaultProps} />);

    fireEvent.click(screen.getByText('Date Created'));
    expect(defaultProps.onSortChange).toHaveBeenCalledWith('created_at');
  });

  it('has tablist role for filter buttons', () => {
    render(<CourseFilter {...defaultProps} />);

    const tablists = screen.getAllByRole('tablist');
    expect(tablists.length).toBe(2); // One for status, one for sort
  });

  it('filter pills have tab role', () => {
    render(<CourseFilter {...defaultProps} />);

    const tabs = screen.getAllByRole('tab');
    expect(tabs.length).toBe(6); // 3 status + 3 sort
  });

  it('shows "Sort by:" label', () => {
    render(<CourseFilter {...defaultProps} />);

    expect(screen.getByText('Sort by:')).toBeInTheDocument();
  });
});
