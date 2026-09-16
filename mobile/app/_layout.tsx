import { useEffect } from "react";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useFonts } from "expo-font";
/*
 * Imported one weight per path, not from each package's index.
 *
 * The index of `@expo-google-fonts/libre-franklin` re-exports all eighteen
 * cuts, and each of those is a `require()` of a .ttf — so a named import of
 * two of them still walks the whole barrel and Metro bundles every file it
 * finds. Measured on an export: 2.1MB of Franklin alone, of which this app
 * uses 224KB. The per-weight subpaths reach exactly one font file each.
 */
import { UnifrakturMaguntia_400Regular } from "@expo-google-fonts/unifrakturmaguntia/400Regular";
import { LibreCaslonDisplay_400Regular } from "@expo-google-fonts/libre-caslon-display/400Regular";
import { LibreCaslonText_400Regular } from "@expo-google-fonts/libre-caslon-text/400Regular";
import { LibreCaslonText_400Regular_Italic } from "@expo-google-fonts/libre-caslon-text/400Regular_Italic";
import { LibreCaslonText_700Bold } from "@expo-google-fonts/libre-caslon-text/700Bold";
import { LibreFranklin_500Medium } from "@expo-google-fonts/libre-franklin/500Medium";
import { LibreFranklin_600SemiBold } from "@expo-google-fonts/libre-franklin/600SemiBold";
import { EditionProvider } from "../lib/edition";
import { paper } from "../theme/tokens";

/*
 * Hold the splash until the type is ready.
 *
 * Called at module scope rather than in an effect, which the API documentation
 * is explicit about: from inside a component this runs after the first frame,
 * by which point the splash may already have been dismissed and the request is
 * simply ignored.
 */
void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  /*
   * The four families the paper is set in, in the seven cuts it actually uses
   * and no more: the blackletter for the nameplate, the display face for
   * banner headlines, the text face in roman, italic and bold, and Franklin in
   * two weights for the furniture. All four are the free Google Fonts the web
   * app loads.
   *
   * Every one of them is fetched over the network on first launch in Expo Go.
   * That is why nothing renders until they resolve — a broadsheet that appears
   * in the system sans and then reflows into Caslon looks broken, and this
   * product is the typography.
   */
  const [fontsLoaded, fontError] = useFonts({
    UnifrakturMaguntia_400Regular,
    LibreCaslonDisplay_400Regular,
    LibreCaslonText_400Regular,
    LibreCaslonText_400Regular_Italic,
    LibreCaslonText_700Bold,
    LibreFranklin_500Medium,
    LibreFranklin_600SemiBold,
  });

  useEffect(() => {
    // A font that fails to load must not hold the splash forever. The paper in
    // the system serif is a poor paper, but it is better than an app that never
    // starts on a device that could not reach fonts.gstatic.com.
    if (fontsLoaded || fontError) void SplashScreen.hideAsync();
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      {/*
        Dark glyphs: the status bar sits on paper, not on a dark chrome. There
        is no `backgroundColor` to set any more — SDK 57 removed it because
        Android is always edge-to-edge now, so the bar is transparent and the
        paper behind it shows through. That is why every screen pads itself by
        the safe-area inset instead.
      */}
      <StatusBar style="dark" />
      <EditionProvider>
        <Stack
          screenOptions={{
            // Every screen draws its own folio line instead. See Folio.tsx.
            headerShown: false,
            // The gap between screens during a push is the app's background,
            // and the default is white — a bright flash between two sheets of
            // buff paper on every navigation.
            contentStyle: { backgroundColor: paper.base },
          }}
        />
      </EditionProvider>
    </SafeAreaProvider>
  );
}
