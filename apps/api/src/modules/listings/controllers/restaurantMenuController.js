/**
 * Restaurant Menu Controller (Pass 3 remediation) — parse input -> call
 * Service -> shape response, same shape as `listingController.js`'s
 * rich-content handlers (`replaceHighlights` etc.). No business logic, no
 * direct database access.
 */

import {
  toMenuResponse,
  toMenuSectionResponse,
  toMenuItemResponse,
} from '../dto/restaurantMenuDto.js';

export function createRestaurantMenuController(restaurantMenuService) {
  return {
    async listForListing(req, res, next) {
      try {
        const { id } = req.validated.params;
        const menus = await restaurantMenuService.getMenusForListing(
          id,
          req.validated.query?.locale,
        );
        res.status(200).json({
          success: true,
          data: menus.map(toMenuResponse),
          meta: null,
          error: null,
        });
      } catch (err) {
        next(err);
      }
    },

    async createMenu(req, res, next) {
      try {
        const { id } = req.validated.params;
        const menu = await restaurantMenuService.createMenu(
          req.principal,
          id,
          req.validated.body,
        );
        res.status(201).json({
          success: true,
          data: toMenuResponse(menu),
          meta: null,
          error: null,
        });
      } catch (err) {
        next(err);
      }
    },

    async updateMenu(req, res, next) {
      try {
        const { menuId } = req.validated.params;
        const menu = await restaurantMenuService.updateMenu(
          req.principal,
          menuId,
          req.validated.body,
        );
        res.status(200).json({
          success: true,
          data: toMenuResponse(menu),
          meta: null,
          error: null,
        });
      } catch (err) {
        next(err);
      }
    },

    async deleteMenu(req, res, next) {
      try {
        const { menuId } = req.validated.params;
        await restaurantMenuService.deleteMenu(req.principal, menuId);
        res.status(204).send();
      } catch (err) {
        next(err);
      }
    },

    async createSection(req, res, next) {
      try {
        const { menuId } = req.validated.params;
        const section = await restaurantMenuService.createSection(
          req.principal,
          menuId,
          req.validated.body,
        );
        res.status(201).json({
          success: true,
          data: toMenuSectionResponse(section),
          meta: null,
          error: null,
        });
      } catch (err) {
        next(err);
      }
    },

    async updateSection(req, res, next) {
      try {
        const { sectionId } = req.validated.params;
        const section = await restaurantMenuService.updateSection(
          req.principal,
          sectionId,
          req.validated.body,
        );
        res.status(200).json({
          success: true,
          data: toMenuSectionResponse(section),
          meta: null,
          error: null,
        });
      } catch (err) {
        next(err);
      }
    },

    async deleteSection(req, res, next) {
      try {
        const { sectionId } = req.validated.params;
        await restaurantMenuService.deleteSection(req.principal, sectionId);
        res.status(204).send();
      } catch (err) {
        next(err);
      }
    },

    async createItem(req, res, next) {
      try {
        const { sectionId } = req.validated.params;
        const item = await restaurantMenuService.createItem(
          req.principal,
          sectionId,
          req.validated.body,
        );
        res.status(201).json({
          success: true,
          data: toMenuItemResponse(item),
          meta: null,
          error: null,
        });
      } catch (err) {
        next(err);
      }
    },

    async updateItem(req, res, next) {
      try {
        const { itemId } = req.validated.params;
        const item = await restaurantMenuService.updateItem(
          req.principal,
          itemId,
          req.validated.body,
        );
        res.status(200).json({
          success: true,
          data: toMenuItemResponse(item),
          meta: null,
          error: null,
        });
      } catch (err) {
        next(err);
      }
    },

    async deleteItem(req, res, next) {
      try {
        const { itemId } = req.validated.params;
        await restaurantMenuService.deleteItem(req.principal, itemId);
        res.status(204).send();
      } catch (err) {
        next(err);
      }
    },
  };
}

export default createRestaurantMenuController;
