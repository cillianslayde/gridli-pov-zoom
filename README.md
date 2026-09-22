# GRIDLI-POV

**Artist Plein Air Precision Mobile Viewfinder**

Part of the [GRIDLI](https://github.com/cillianslayde) suite of free art/creator tools.

## What it does

GRIDLI-POV turns a phone (or any browser) into a precision viewfinder for plein air and studio painting. Point your camera at a scene, choose your canvas size and orientation, and a proportionally accurate crop box with a customizable reference grid overlays the live feed — so you can compose and grid off your painting surface to match exactly what you see.

- Live camera viewfinder (or network stream from IP Webcam / DroidCam on Android)
- Canvas-size presets from small sketch formats up to large studio sizes, in both square, portrait, and landscape aspect ratios
- Adjustable grid line color and thickness
- One-tap capture: saves a JPEG of the cropped, gridded frame for reference

## Running it

This is a single static site with no build step and no server dependency for the core browser-camera mode.

1. Open `index.html` in a browser (camera access requires HTTPS or `localhost`).
2. Grant camera permission when prompted.
3. Choose a canvas size and orientation, adjust the grid, and tap the shutter to capture.

To use a phone's rear camera from a laptop instead of the device's own browser, use the Source panel (📡) to connect to an IP Webcam or DroidCam stream running on the phone over the same LAN.

## Project structure

```
gridli-pov/
├── index.html          # Markup only
├── assets/
│   ├── css/
│   │   └── main.css    # All styling
│   └── js/
│       └── main.js     # All behavior
├── README.md
└── LICENSE
```

## License

All Rights Reserved — see [LICENSE](LICENSE). Free to use via the hosted link; not licensed for reuse or redistribution of the source.
