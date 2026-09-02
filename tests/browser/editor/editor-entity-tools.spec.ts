import { expect, test } from '@playwright/test';
import { parseEntityOrigin } from '../../../packages/worldview-editor/src/core/index.js';
import { adjacentBrushSource } from './support/editor-fixtures.js';
import {
  openEditor,
  readEditorDocument,
  perspectiveWorldPoint,
  topWorldPoint,
  chooseSelectOption,
  setCheckbox,
} from './support/editor-browser-helpers.js';

test.describe('Editor entity tools', () => {
  test('places, selects, moves, duplicate-moves, deletes, and restores point entities', async ({
    page,
  }) => {
    await openEditor(page);
    await page.getByRole('button', { name: 'Entity', exact: true }).click();
    await expect(page.locator('#point-entity-tool-section')).toBeVisible();
    await chooseSelectOption(page, 'Preset', 'Player start');
    await expect(page.locator('#point-entity-classname')).toHaveValue('info_player_start');

    const placedPoint = await perspectiveWorldPoint(page, [96, 96, 0]);
    await page.mouse.click(placedPoint.x, placedPoint.y);
    await expect(page.locator('#entity-count')).toHaveText('4');
    await expect(page.locator('#selection-kind')).toHaveText('Entity');
    await expect(page.locator('#entity-classname')).toHaveText('info_player_start');
    await expect(page.locator('#status-message')).toContainText('Placed info_player_start');

    let document = await readEditorDocument(page);
    let playerStarts = document.entities.filter(
      (entity) => entity.properties.classname === 'info_player_start',
    );
    expect(playerStarts.map(parseEntityOrigin)).toContainEqual([96, 96, 32]);

    await page.getByRole('button', { name: 'Select', exact: true }).click();
    const placedTopPoint = await topWorldPoint(page, 96, 96);
    const movedPoint = await topWorldPoint(page, 160, 160);
    await page.mouse.move(placedTopPoint.x, placedTopPoint.y);
    await page.mouse.down();
    await page.mouse.move(movedPoint.x, movedPoint.y, { steps: 12 });
    await page.mouse.up();
    await expect(page.locator('#status-message')).toContainText('Move entity');
    document = await readEditorDocument(page);
    playerStarts = document.entities.filter(
      (entity) => entity.properties.classname === 'info_player_start',
    );
    expect(playerStarts.map(parseEntityOrigin)).toContainEqual([160, 160, 32]);

    const duplicatedPoint = await topWorldPoint(page, 224, 224);
    await page.keyboard.down('Control');
    await page.mouse.move(movedPoint.x, movedPoint.y);
    await page.mouse.down();
    await page.mouse.move(duplicatedPoint.x, duplicatedPoint.y, { steps: 12 });
    await page.mouse.up();
    await page.keyboard.up('Control');
    await expect(page.locator('#entity-count')).toHaveText('5');
    await expect(page.locator('#status-message')).toContainText('Duplicate and move entity');
    document = await readEditorDocument(page);
    playerStarts = document.entities.filter(
      (entity) => entity.properties.classname === 'info_player_start',
    );
    expect(playerStarts.map(parseEntityOrigin)).toEqual(
      expect.arrayContaining([
        [160, 160, 32],
        [224, 224, 32],
      ]),
    );

    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(page.locator('#entity-count')).toHaveText('4');
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(page.locator('#entity-count')).toHaveText('5');
    await expect(page.locator('#selection-kind')).toHaveText('Entity');
  });

  test('rotates and flips point entities while optionally preserving their angle property', async ({
    page,
  }) => {
    await openEditor(page);
    const playerPoint = await topWorldPoint(page, 0, -96);
    await page.mouse.click(playerPoint.x, playerPoint.y);
    await expect(page.locator('#selection-kind')).toHaveText('Entity');
    await expect(page.locator('#entity-classname')).toHaveText('info_player_start');
    await expect(page.locator('#object-flip-section')).toBeVisible();

    await page.getByRole('button', { name: 'Rotate', exact: true }).click();
    await expect(page.locator('#transform-tool-title')).toHaveText('Rotate entity');
    await expect(page.locator('#rotate-update-entity-angles')).toBeChecked();
    await expect(page.locator('#rotate-update-entity-angles')).toBeEnabled();
    await page.locator('#rotate-angle').fill('90');
    await page.getByRole('button', { name: 'Apply transform' }).click();
    await expect(page.locator('#status-message')).toContainText('Rotate entity');

    let document = await readEditorDocument(page);
    let player = document.entities.find(
      (entity) => entity.properties.classname === 'info_player_start',
    )!;
    expect(parseEntityOrigin(player)).toEqual([0, -96, 24]);
    expect(player.properties.angle).toBe('180');

    await setCheckbox(page, 'Update entity angles', false);
    await page.getByRole('button', { name: 'Apply transform' }).click();
    document = await readEditorDocument(page);
    player = document.entities.find(
      (entity) => entity.properties.classname === 'info_player_start',
    )!;
    expect(player.properties.angle).toBe('180');

    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await setCheckbox(page, 'Update entity angles', true);
    await page.getByRole('button', { name: 'Flip Y', exact: true }).click();
    await expect(page.locator('#status-message')).toContainText('Flip entity');
    document = await readEditorDocument(page);
    player = document.entities.find(
      (entity) => entity.properties.classname === 'info_player_start',
    )!;
    expect(parseEntityOrigin(player)).toEqual([0, -96, 24]);
    expect(player.properties.angle).toBe('270');

    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    document = await readEditorDocument(page);
    player = document.entities.find(
      (entity) => entity.properties.classname === 'info_player_start',
    )!;
    expect(player.properties.angle).toBe('90');
  });

  test('converts a selected brush set into an entity and makes it structural again', async ({
    page,
  }) => {
    await openEditor(page);
    await page.getByRole('button', { name: 'Source', exact: true }).click();
    await page.locator('#map-source').fill(adjacentBrushSource());
    await page.getByRole('button', { name: 'Apply source', exact: true }).click();
    const left = await topWorldPoint(page, -16, 0);
    const right = await topWorldPoint(page, 16, 0);
    await page.mouse.click(left.x, left.y);
    await page.keyboard.down('Control');
    await page.mouse.click(right.x, right.y);
    await page.keyboard.up('Control');
    await expect(page.locator('#selection-kind')).toHaveText('2 Brushes');

    await page.locator('#brush-entity-classname').fill('func_detail');
    await page.getByRole('button', { name: 'Make Entity', exact: true }).click();
    await expect(page.locator('#entity-count')).toHaveText('4');
    await expect(page.locator('#entity-classname')).toHaveText('func_detail');
    let document = await readEditorDocument(page);
    expect(
      document.entities.find((entity) => entity.properties.classname === 'func_detail')?.primitives,
    ).toHaveLength(2);

    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(page.locator('#entity-count')).toHaveText('3');
    await page.getByRole('button', { name: 'Redo', exact: true }).click();
    await expect(page.locator('#entity-count')).toHaveText('4');
    await expect(page.getByRole('button', { name: 'Make Structural', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Make Structural', exact: true }).click();

    await expect(page.locator('#entity-count')).toHaveText('3');
    document = await readEditorDocument(page);
    expect(document.entities.some((entity) => entity.properties.classname === 'func_detail')).toBe(
      false,
    );
    expect(
      document.entities.find((entity) => entity.properties.classname === 'worldspawn')?.primitives,
    ).toHaveLength(2);
  });
});
