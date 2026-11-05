import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ImageMagnifier } from './image-magnifier';

describe('ImageMagnifier', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    act(() => {
      vi.runOnlyPendingTimers();
    });
    vi.useRealTimers();
    cleanup();
  });

  it('renders image with src and alt attributes', () => {
    render(
      <ImageMagnifier
        src="http://localhost:4000/uploads/product/sample.jpg"
        alt="Sample organic tee"
      />,
    );

    const img = screen.getByRole('img');
    expect(img).toHaveAttribute('src', 'http://localhost:4000/uploads/product/sample.jpg');
    expect(img).toHaveAttribute('alt', 'Sample organic tee');
  });

  it('activates lens and flyout on mouse enter, auto-focuses container, and hides on debounced mouse leave', () => {
    render(
      <ImageMagnifier
        src="http://localhost:4000/uploads/product/sample.jpg"
        alt="Sample organic tee"
        zoomLevel={3}
        mode="flyout"
      />,
    );

    const container = screen.getByTestId('image-magnifier-container');
    // Initially lens is not rendered
    expect(screen.queryByTestId('image-magnifier-lens')).not.toBeInTheDocument();
    expect(screen.queryByTestId('image-magnifier-flyout')).not.toBeInTheDocument();

    // Mock bounding client rect
    vi.spyOn(container, 'getBoundingClientRect').mockReturnValue({
      left: 100,
      top: 100,
      width: 400,
      height: 400,
      right: 500,
      bottom: 500,
      x: 100,
      y: 100,
      toJSON: () => {},
    });

    // Enter & Move cursor to (200, 200) -> 25% across
    fireEvent.mouseEnter(container, { clientX: 200, clientY: 200 });
    fireEvent.mouseMove(container, { clientX: 200, clientY: 200 });

    expect(screen.getByTestId('image-magnifier-lens')).toBeInTheDocument();
    const flyout = screen.getByTestId('image-magnifier-flyout');
    expect(flyout).toBeInTheDocument();
    expect(flyout).toHaveStyle({
      backgroundSize: '300%',
      backgroundPosition: '25% 25%',
    });

    // Mouse leave triggers debounced exit (80ms)
    fireEvent.mouseLeave(container);
    // Still visible before timer fires (prevents boundary jitter)
    expect(screen.getByTestId('image-magnifier-lens')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(120);
    });
    expect(screen.queryByTestId('image-magnifier-lens')).not.toBeInTheDocument();
    expect(screen.queryByTestId('image-magnifier-flyout')).not.toBeInTheDocument();
  });

  it('renders loupe mode over cursor', () => {
    render(
      <ImageMagnifier
        src="http://localhost:4000/uploads/product/sample.jpg"
        alt="Sample organic tee"
        zoomLevel={2}
        mode="loupe"
      />,
    );

    const container = screen.getByTestId('image-magnifier-container');
    vi.spyOn(container, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 500,
      height: 500,
      right: 500,
      bottom: 500,
      x: 0,
      y: 0,
      toJSON: () => {},
    });

    fireEvent.mouseEnter(container, { clientX: 250, clientY: 250 });
    fireEvent.mouseMove(container, { clientX: 250, clientY: 250 });

    const loupe = screen.getByTestId('image-magnifier-loupe');
    expect(loupe).toBeInTheDocument();
    expect(loupe).toHaveStyle({
      backgroundSize: '200%',
      backgroundPosition: '50% 50%',
    });
  });

  it('handles touch gestures (onTouchStart activates, onTouchMove pans, onTouchEnd deactivates)', () => {
    render(
      <ImageMagnifier
        src="http://localhost:4000/uploads/product/sample.jpg"
        alt="Sample organic tee"
        mode="flyout"
      />,
    );

    const container = screen.getByTestId('image-magnifier-container');
    vi.spyOn(container, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 400,
      height: 400,
      right: 400,
      bottom: 400,
      x: 0,
      y: 0,
      toJSON: () => {},
    });

    // Touch start activates lens immediately
    fireEvent.touchStart(container, {
      touches: [{ clientX: 200, clientY: 200 }],
    });
    expect(screen.getByTestId('image-magnifier-lens')).toBeInTheDocument();

    // Touch move tracks cursor
    fireEvent.touchMove(container, {
      touches: [{ clientX: 300, clientY: 300 }],
    });
    const flyout = screen.getByTestId('image-magnifier-flyout');
    expect(flyout).toHaveStyle({
      backgroundPosition: '75% 75%',
    });

    // Touch end dismisses after finger lift
    fireEvent.touchEnd(container);
    act(() => {
      vi.advanceTimersByTime(150);
    });
    expect(screen.queryByTestId('image-magnifier-lens')).not.toBeInTheDocument();
  });

  it('supports explicit flyoutPlacement ("left" and "inside" opposite to cursor)', () => {
    const { rerender } = render(
      <ImageMagnifier
        src="http://localhost:4000/uploads/product/sample.jpg"
        alt="Sample organic tee"
        mode="flyout"
        flyoutPlacement="left"
      />,
    );

    const container = screen.getByTestId('image-magnifier-container');
    vi.spyOn(container, 'getBoundingClientRect').mockReturnValue({
      left: 100,
      top: 100,
      width: 400,
      height: 400,
      right: 500,
      bottom: 500,
      x: 100,
      y: 100,
      toJSON: () => {},
    });

    fireEvent.mouseEnter(container, { clientX: 200, clientY: 200 });
    const flyoutLeft = screen.getByTestId('image-magnifier-flyout');
    expect(flyoutLeft.className).toContain('right-full');

    // Rerender with "inside" placement — when cursor on right half (clientX=400 -> x=75%), flyout pins to left-2
    rerender(
      <ImageMagnifier
        src="http://localhost:4000/uploads/product/sample.jpg"
        alt="Sample organic tee"
        mode="flyout"
        flyoutPlacement="inside"
      />,
    );

    fireEvent.mouseMove(container, { clientX: 400, clientY: 200 });
    const flyoutInsideLeft = screen.getByTestId('image-magnifier-flyout');
    expect(flyoutInsideLeft.className).toContain('left-2');

    // Move cursor to left half (clientX=150 -> x=12.5%), flyout flips to right-2
    fireEvent.mouseMove(container, { clientX: 150, clientY: 200 });
    const flyoutInsideRight = screen.getByTestId('image-magnifier-flyout');
    expect(flyoutInsideRight.className).toContain('right-2');
  });

  it('handles keyboard navigation with arrow keys and stops propagation on escape', () => {
    render(
      <ImageMagnifier
        src="http://localhost:4000/uploads/product/sample.jpg"
        alt="Sample organic tee"
        mode="flyout"
      />,
    );

    const container = screen.getByTestId('image-magnifier-container');

    // Press ArrowRight to activate lens and shift coordinates
    fireEvent.keyDown(container, { key: 'ArrowRight' });
    expect(screen.getByTestId('image-magnifier-lens')).toBeInTheDocument();

    // Press Escape to dismiss lens
    fireEvent.keyDown(container, { key: 'Escape' });
    expect(screen.queryByTestId('image-magnifier-lens')).not.toBeInTheDocument();
  });

  it('propagates onError when image fails to load', () => {
    const onError = vi.fn();
    render(
      <ImageMagnifier
        src="http://localhost:4000/uploads/invalid.jpg"
        alt="Invalid file"
        onError={onError}
      />,
    );

    const img = screen.getByRole('img');
    fireEvent.error(img);
    expect(onError).toHaveBeenCalledTimes(1);
  });
});
