/**
 * SETRA - Shipment Report Spreadsheet Integration
 * File: 01_Menu.gs
 * Scope: menu bar Setra + onEdit dispatcher.
 */

function onOpen() {
  const ui = SpreadsheetApp.getUi();
  const shipmentsMenu = ui
    .createMenu('Shipments')
    .addItem('update', 'setraUpdateShipmentsToDatabase')
    .addItem('fetching', 'setraFetchingShipmentsFromDatabase')
    .addItem('hapus data tercentang', 'setraDeleteCheckedShipments');

  ui.createMenu(SETRA.MENU_NAME)
    .addItem('Users', 'setraSyncUsers')
    .addItem('Locking', 'setraSyncLocking')
    .addSubMenu(shipmentsMenu)
    .addSeparator()
    .addItem('Reconciliation', 'setraRefreshRekonsil')
    .addSeparator()
    .addItem('Report_Performance', 'setraProcessDailyReport')
    .addToUi();

  try {
    setraPrepareShipmentsSheet_();
  } catch (error) {
    // Jangan gagalkan onOpen jika template belum lengkap.
  }
}

function onEdit(e) {
  if (!e || !e.range) return;

  try {
    setraHandleShipmentsOnEdit_(e);
  } catch (error) {
    setraGetSpreadsheet_().toast('Setra shipments onEdit gagal: ' + (error.message || error), 'Setra', 5);
  }

  try {
    setraRekonsilOnEdit_(e);
  } catch (error) {
    setraGetSpreadsheet_().toast('Setra rekonsil onEdit gagal: ' + (error.message || error), 'Setra', 5);
  }
}

function setraSyncUsers() {
  setraSyncManagedSheet_('USERS');
}

function setraSyncShipments() {
  setraUpdateShipmentsToDatabase();
}

function setraSyncLocking() {
  setraSyncManagedSheet_('LOCKING');
}
