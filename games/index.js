'use strict';
const list = [
  require('./chess'),
  require('./go'),
  require('./othello'),
  require('./davinci'),
  require('./louie'),
  require('./halligalli'),
  require('./uno')
];
const byId = {};
for (const g of list) byId[g.id] = g;
module.exports = {
  list,
  byId,
  meta: list.map(g => ({
    id: g.id, name: g.name, nameEn: g.nameEn,
    minPlayers: g.minPlayers, maxPlayers: g.maxPlayers, realtime: !!g.realtime,
    options: g.options || null
  }))
};
