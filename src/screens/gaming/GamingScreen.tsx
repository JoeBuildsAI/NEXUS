import { useNavigationStore } from "@/state/navigationStore";
import { GameLibrary } from "./GameLibrary";
import { GameDetail } from "./GameDetail";

export function GamingScreen() {
  const selectedGameId = useNavigationStore((s) => s.selectedGameId);
  return selectedGameId ? (
    <GameDetail gameId={selectedGameId} />
  ) : (
    <GameLibrary />
  );
}
