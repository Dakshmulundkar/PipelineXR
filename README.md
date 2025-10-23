# PipelineXR - CI/CD Platform with Hyperspeed Visualization

PipelineXR is a next-generation CI/CD automation platform with immersive 3D visualization powered by Three.js and React.

## Prerequisites

Before you begin, ensure you have the following installed on your system:

1. **Node.js** (version 14 or higher)
2. **npm** (comes with Node.js) or **yarn**

## Installation

### 1. Clone the Repository

```bash
git clone <repository-url>
cd PipelineXR
```

### 2. Install Dependencies

All required dependencies are listed in `package.json`. To install them, run:

```bash
npm install
```

This will install all the necessary packages including:
- React and ReactDOM
- Three.js for 3D rendering
- Postprocessing for visual effects
- React Router for navigation
- Testing libraries

### 3. Start the Development Server

```bash
npm start
```

The application will start on http://localhost:3000

## Available Scripts

In the project directory, you can run:

- `npm start` - Runs the app in development mode
- `npm test` - Launches the test runner
- `npm run build` - Builds the app for production
- `npm run eject` - Removes the single build dependency

## Project Structure

```
PipelineXR/
├── public/
│   ├── index.html
│   └── ...
├── src/
│   ├── components/
│   │   ├── Hyperspeed.js
│   │   └── LogoLoop.js
│   ├── styles/
│   │   ├── App.css
│   │   ├── Hyperspeed.css
│   │   └── LogoLoop.css
│   ├── App.js
│   ├── App.css
│   └── index.js
├── package.json
└── README.md
```

## Dependencies

### Core Dependencies
- `react`: ^18.2.0
- `react-dom`: ^18.2.0
- `three`: ^0.151.3 (3D rendering library)
- `postprocessing`: ^6.30.1 (Visual effects library)
- `react-router-dom`: ^7.9.4 (Navigation)

### Development Dependencies
- `react-scripts`: 5.0.1 (Build scripts and configuration)
- `@testing-library/react`: ^13.4.0 (Testing utilities)
- `@testing-library/jest-dom`: ^5.16.5 (DOM testing utilities)
- `@testing-library/user-event`: ^13.5.0 (User event simulation)
- `web-vitals`: ^2.1.4 (Web performance metrics)

## Browser Support

The application supports:
- Production: Browsers with >0.2% market share, not dead, not Opera Mini
- Development: Latest versions of Chrome, Firefox, and Safari

## Troubleshooting

### Common Issues

1. **Port already in use**: The app runs on port 3000 by default. If this port is occupied, the system will prompt you to use another port.

2. **Missing dependencies**: If you encounter any missing module errors, run `npm install` again.

3. **Three.js version issues**: Ensure postprocessing library version is compatible with Three.js. If needed, update both:
   ```bash
   npm install three@latest postprocessing@latest
   ```

### Windows Specific Issues

On Windows, if you see deprecation warnings, they are suppressed using:
```bash
set NODE_OPTIONS=--no-warnings
```

This is already configured in the start script.

## Building for Production

To create a production build:

```bash
npm run build
```

This creates a `build` folder with all the necessary files for deployment.

## Deployment

The application can be deployed to any static file hosting service. The `build` folder contains all the necessary files.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License

This project is proprietary and intended for internal use only.