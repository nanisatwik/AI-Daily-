/**
 * The AI hubs the paper can localise to.
 *
 * Lives in lib/ rather than services/ because both halves of the product need
 * it: the ingestion pipeline matches these aliases when geo-tagging, and the
 * browser lists the cities during onboarding. One definition, so the two can
 * never drift into disagreeing about which cities exist.
 */

export type Hub = {
  city: string;
  state: string | null;
  country: string;
  /** Lower-cased phrases that indicate this hub. Longer phrases score higher. */
  aliases: string[];
};

export const HUBS: Hub[] = [
  {
    city: "San Francisco",
    state: "California",
    country: "United States",
    aliases: [
      "san francisco", "bay area", "silicon valley", "palo alto",
      "mountain view", "menlo park", "cupertino", "santa clara",
      "sunnyvale", "berkeley", "oakland", "san jose",
    ],
  },
  {
    city: "Boston",
    state: "Massachusetts",
    country: "United States",
    aliases: ["boston", "cambridge, massachusetts", "cambridge, ma", "somerville", "kendall square"],
  },
  {
    city: "New York",
    state: "New York",
    country: "United States",
    aliases: ["new york city", "new york", "manhattan", "brooklyn", "nyc"],
  },
  {
    city: "Seattle",
    state: "Washington",
    country: "United States",
    aliases: ["seattle", "redmond", "bellevue"],
  },
  {
    city: "Austin",
    state: "Texas",
    country: "United States",
    aliases: ["austin, texas", "austin, tx"],
  },
  {
    city: "Los Angeles",
    state: "California",
    country: "United States",
    aliases: ["los angeles", "santa monica", "pasadena"],
  },
  {
    city: "Bengaluru",
    state: "Karnataka",
    country: "India",
    aliases: ["bengaluru", "bangalore"],
  },
  {
    city: "Hyderabad",
    state: "Telangana",
    country: "India",
    aliases: ["hyderabad"],
  },
  {
    city: "Toronto",
    state: "Ontario",
    country: "Canada",
    aliases: ["toronto", "waterloo, ontario", "mississauga"],
  },
  { city: "London", state: null, country: "United Kingdom", aliases: ["london"] },
  { city: "Singapore", state: null, country: "Singapore", aliases: ["singapore"] },
];

export const HUB_CITIES = HUBS.map((h) => h.city);
