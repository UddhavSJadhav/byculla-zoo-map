/** Public site origin used for canonical URLs, Open Graph, and the sitemap. */
export const siteOrigin = 'https://byculla-zoo-map.vercel.app'

export const siteName = 'Byculla Zoo Navigator'

export const siteTitle = 'Byculla Zoo Map & Visitor Guide | Mumbai'

export const siteDescription =
  'Explore Byculla Zoo with an interactive map. Discover attractions, explore the zoo layout, and find your way around.'

export const ogImagePath = '/og-preview.jpg'

export const contentPages = [
  {
    path: '/visitor-guide/',
    title: 'Byculla Zoo Visitor Guide | Independent Map Tips',
    description:
      'Plan a visit to Veermata Jijabai Bhosale Udyan with this independent Byculla Zoo visitor guide covering the interactive map, navigation, and practical tips.',
  },
  {
    path: '/attractions/',
    title: 'Byculla Zoo Attractions on the Interactive Map',
    description:
      'Learn how to discover Byculla Zoo attractions on the interactive map, including animals, birds, gardens, venues, and visitor amenities.',
  },
  {
    path: '/how-to-use-the-map/',
    title: 'How to Use the Byculla Zoo Interactive Map',
    description:
      'Step-by-step help for using the Byculla Zoo map: explore the layout, open attraction details, enable GPS, and request walking routes on verified paths.',
  },
] as const
