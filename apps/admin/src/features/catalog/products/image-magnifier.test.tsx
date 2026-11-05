import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ImageMagnifier } from './image-magnifier';

describe('ImageMagnifier', () => {
  afterEach(() => {
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

  it('activates lens and flyout on mouse enter and move in flyout mode', () => {
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

    // Mouse leave hides the lens & flyout
    fireEvent.mouseLeave(container);
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

  it('handles keyboard navigation with arrow keys and escape key', () => {
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

    // Press Escape to dismiss
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
