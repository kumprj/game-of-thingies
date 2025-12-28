import './global.css'
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import HomePage from "./pages/HomePage";
import StartGamePage from "./pages/StartGamePage";
const root = ReactDOM.createRoot(document.getElementById("root") as HTMLElement);

root.render(
    <React.StrictMode>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/:gameId" element={<StartGamePage/>} />
        </Routes>
      </BrowserRouter>
    </React.StrictMode>
);
