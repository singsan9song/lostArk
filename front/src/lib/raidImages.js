const raidImages = {
  argos: '/images/raid/argos.jpg',
  kayangel: '/images/raid/kayangel.jpg',
  'ivory-tower': '/images/raid/ivorytower.jpg',
  'horizon-cathedral': '/images/raid/cathedralofthehorizon.jpg',
  valtan: '/images/raid/valtan.jpg',
  vykas: '/images/raid/vykas.jpg',
  'kakul-saydon': '/images/raid/kakul.jpg',
  brelshaza: '/images/raid/brelshaza.jpg',
  akkan: '/images/raid/illiaka.jpg',
  thaemine: '/images/raid/kamen.jpg',
  behemoth: '/images/raid/behemoth.jpg',
  echidna: '/images/raid/echidna.jpg',
  aegir: '/images/raid/kazeros_act1.jpg',
  'brelshaza-act-2': '/images/raid/kazeros_act2.jpg',
  mordum: '/images/raid/kazeros_act3.jpg',
  armoche: '/images/raid/kazeros_act4.jpg',
  kazeros: '/images/raid/kazeros_finalact.jpg',
  serka: '/images/raid/serka.jpg',
  rimerake: '/images/raid/rimerake.jpg',
}

export const getRaidImage = (raidId) => raidImages[raidId] || null

export default raidImages
