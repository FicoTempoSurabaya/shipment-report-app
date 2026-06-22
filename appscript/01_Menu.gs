/**
 * SETRA - Shipment Report Spreadsheet Integration
 * File: 01_Menu.gs
 * Scope: menu bar Setra.
 */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu(SETRA.MENU_NAME)
    .addItem('Users', 'setraSyncUsers')
    .addItem('Shipments', 'setraSyncShipments')
    .addItem('Locking', 'setraSyncLocking')
    .addToUi();
}

function setraSyncUsers() {
  setraSyncManagedSheet_('USERS');
}

function setraSyncShipments() {
  setraSyncManagedSheet_('SHIPMENTS');
}

function setraSyncLocking() {
  setraSyncManagedSheet_('LOCKING');
}
