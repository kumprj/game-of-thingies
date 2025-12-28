import './global.css'
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import HomePage from "./HomePage";
import Old_StartGamePage from "./Old_StartGamePage";
const root = ReactDOM.createRoot(document.getElementById("root") as HTMLElement);

root.render(
    <React.StrictMode>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/:gameId" element={<Old_StartGamePage />} />
        </Routes>
      </BrowserRouter>
    </React.StrictMode>
);
