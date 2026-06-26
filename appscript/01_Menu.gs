/**
 * SETRA - Spreadsheet Database Sync
 * File: 01_Menu.gs
 * Scope: menu dan dispatcher trigger.
 */

function onOpen() {
  const ui = SpreadsheetApp.getUi();

  const shipmentsMenu = ui
    .createMenu('Shipments')
    .addItem('Updating', 'setraShipmentsUpdating')
    .addItem('Fetching', 'setraShipmentsFetching')
    .addItem('Deleting', 'setraShipmentsDeleting');

  ui.createMenu(SETRA.MENU_NAME)
    .addItem('Users Checking', 'setraUsersChecking')
    .addItem('Date Locking', 'setraDateLocking')
    .addSubMenu(shipmentsMenu)
    .addSeparator()
    .addItem('Reconciliation (Tunda Dulu)', 'setraReconciliationPending')
    .addItem('Performance (Tunda Dulu)', 'setraPerformancePending')
    .addToUi();

  try {
    setraSetupRuntime_();
  } catch (error) {
    setraGetSpreadsheet_().toast('Setup Setra belum lengkap: ' + (error.message || error), 'Setra', 6);
  }
}

function onEdit(e) {
  if (!e || !e.range) return;

  try {
    setraHandleOnEdit_(e);
  } catch (error) {
    setraGetSpreadsheet_().toast('Setra onEdit gagal: ' + (error.message || error), 'Setra', 6);
  }
}

function setraReconciliationPending() {
  SpreadsheetApp.getUi().alert('Reconciliation ditunda. Kita fokus koneksi database dulu.');
}

function setraPerformancePending() {
  SpreadsheetApp.getUi().alert('Performance ditunda. Kita fokus koneksi database dulu.');
}
