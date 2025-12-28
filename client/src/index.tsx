import './global.css'
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import HomePage from "./pages/HomePage";
import StartGamePage from "./pages/StartGamePage";

// Get the root DOM element where the React application will be mounted.
const root = ReactDOM.createRoot(document.getElementById("root") as HTMLElement);

// Render the React application into the root DOM element.
root.render(
    <React.StrictMode>
      {/* Wrap the application in a BrowserRouter to enable client-side routing. */}
      <BrowserRouter>
        <Routes>
          {/* Define the route for the home page. */}
          <Route path="/" element={<HomePage />} />
          {/* Define the route for the StartGamePage, with a dynamic gameId parameter. */}
          <Route path="/:gameId" element={<StartGamePage/>} />
        </Routes>
      </BrowserRouter>
    </React.StrictMode>
);