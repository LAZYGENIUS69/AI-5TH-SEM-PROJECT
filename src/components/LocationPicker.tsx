import { useState } from "react";
import { Loader2, MapPin, Navigation, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { searchPlaces, type GeoPlace } from "@/services/weather";
import { toast } from "sonner";

export function LocationPicker({
  placeName,
  onSelect,
}: {
  placeName: string;
  onSelect: (place: { placeName: string; latitude: number; longitude: number }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GeoPlace[]>([]);
  const [busy, setBusy] = useState(false);

  const runSearch = async () => {
    if (query.trim().length < 2) return;
    setBusy(true);
    try {
      setResults(await searchPlaces(query));
    } catch {
      toast.error("Could not search for that place. Check your connection.");
    } finally {
      setBusy(false);
    }
  };

  const useMyLocation = () => {
    if (!navigator.geolocation) {
      toast.error("This device cannot share its location.");
      return;
    }
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setBusy(false);
        onSelect({
          placeName: "My field location",
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        });
        setOpen(false);
      },
      () => {
        setBusy(false);
        toast.error("Location permission was refused.");
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <MapPin className="size-4" />
          {placeName}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Set your field location</DialogTitle>
          <DialogDescription>
            Weather, irrigation and alerts are all calculated for this point.
          </DialogDescription>
        </DialogHeader>
        <div className="flex gap-2">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && runSearch()}
            placeholder="Search a village, town or district"
          />
          <Button onClick={runSearch} disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
          </Button>
        </div>
        <div className="max-h-64 space-y-1 overflow-y-auto">
          {results.map((r) => (
            <button
              key={`${r.latitude},${r.longitude}`}
              onClick={() => {
                onSelect({
                  placeName: [r.name, r.admin].filter(Boolean).join(", "),
                  latitude: r.latitude,
                  longitude: r.longitude,
                });
                setOpen(false);
              }}
              className="flex w-full flex-col rounded-lg px-3 py-2 text-left transition-colors hover:bg-accent"
            >
              <span className="text-sm font-medium">
                {r.name}
                {r.admin ? `, ${r.admin}` : ""}
              </span>
              <span className="text-xs text-muted-foreground">
                {r.country} · {r.latitude.toFixed(2)}, {r.longitude.toFixed(2)}
              </span>
            </button>
          ))}
        </div>
        <Button variant="secondary" onClick={useMyLocation} disabled={busy} className="gap-2">
          <Navigation className="size-4" /> Use my current location
        </Button>
      </DialogContent>
    </Dialog>
  );
}
