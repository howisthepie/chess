# ♟️ Supabase Chess

A beautiful, high-performance chess application built with React, Vite, and Supabase. Play against a powerful Stockfish AI, track your progress, and enjoy a premium gaming experience with smooth animations and high-quality sound effects.

## ✨ Features

-   **🎮 Powerful AI**: Integrated Stockfish engine running in a Web Worker for smooth, challenging gameplay without UI lag.
-   **🔊 Immersive Audio**: High-quality sound effects for moves, captures, checks, and game outcomes.
-   **🎨 Custom Themes**: Multiple board themes (Classic, Midnight, Garden) and support for Light/Dark modes.
-   **🔐 Cloud Sync**: Optional authentication via Supabase to save your game history and settings across devices.
-   **📱 Fully Responsive**: Optimized for both desktop and mobile play.
-   **🕰️ Game Replay**: Review your past games move by move with keyboard navigation (Arrow keys).
-   **💾 Local-First**: Play immediately without an account; your progress is saved automatically to local storage.

## 🚀 Getting Started

### Prerequisites

-   [Node.js](https://nodejs.org/) (v18 or later)
-   [npm](https://www.npmjs.com/) or [yarn](https://yarnpkg.com/)

### Installation

1.  **Clone the repository**:
    ```bash
    git clone https://github.com/howisthepie/chess.git
    cd chess
    ```

2.  **Install dependencies**:
    ```bash
    npm install
    ```

3.  **Set up Environment Variables**:
    Create a `.env.local` file in the root directory and add your Supabase credentials (optional for local play):
    ```env
    VITE_SUPABASE_URL=your_supabase_url
    VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
    ```

4.  **Run the development server**:
    ```bash
    npm run dev
    ```

5.  **Open your browser**:
    Navigate to `http://localhost:5173` to start playing!

## 🛠️ Tech Stack

-   **Frontend**: React + Vite + TypeScript
-   **Chess Logic**: [chess.js](https://github.com/jhlywa/chess.js)
-   **AI Engine**: [Stockfish](https://stockfishchess.org/) (via Web Worker)
-   **Backend**: [Supabase](https://supabase.com/) (Auth, Database)
-   **Icons**: [Lucide React](https://lucide.dev/)
-   **Styling**: Vanilla CSS with CSS Variables for theming

## 📁 Project Structure

-   `src/App.tsx`: Main application component and state management.
-   `src/lib/chess.ts`: Chess utility functions and move validation.
-   `src/lib/persistence.ts`: Data synchronization between local storage and Supabase.
-   `src/workers/stockfish.worker.ts`: Stockfish AI integration.
-   `public/sounds/`: High-quality audio assets for game events.
-   `supabase/migrations/`: Database schema and RLS policies.

## 🤝 Contributing

Contributions are welcome! Feel free to open an issue or submit a pull request if you have ideas for new features or improvements.

## 📄 License

This project is open source. (Add your preferred license here, e.g., MIT).

---

Built with ❤️ by [howisthepie](https://github.com/howisthepie)
