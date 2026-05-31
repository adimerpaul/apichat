import 'package:flutter/material.dart';

import '../models/chat_message.dart';
import 'media_preview.dart';

class MessageBubble extends StatelessWidget {
  const MessageBubble({
    super.key,
    required this.message,
    required this.isOwn,
    required this.mediaUrlBuilder,
    this.onEdit,
    this.onDelete,
  });

  final ChatMessage message;
  final bool isOwn;
  final String Function(String path) mediaUrlBuilder;
  final VoidCallback? onEdit;
  final VoidCallback? onDelete;

  @override
  Widget build(BuildContext context) {
    final background = isOwn ? const Color(0xFFEAF5FC) : Colors.white;
    final border = isOwn ? const Color(0xFF9BC5E4) : const Color(0xFFD9E0E7);

    return Align(
      alignment: isOwn ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        width: MediaQuery.sizeOf(context).width * 0.78,
        margin: const EdgeInsets.only(bottom: 10),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: background,
          border: Border.all(color: border),
          borderRadius: BorderRadius.circular(8),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    message.userName,
                    style: const TextStyle(fontWeight: FontWeight.w700),
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                Text(
                  _formatTime(message.createdAt),
                  style: const TextStyle(
                    fontSize: 12,
                    color: Color(0xFF5C6B7A),
                  ),
                ),
              ],
            ),
            if (message.message.isNotEmpty) ...[
              const SizedBox(height: 6),
              Text(message.message),
            ],
            if (message.mediaUrl != null) ...[
              const SizedBox(height: 10),
              MediaPreview(
                type: message.mediaType,
                url: mediaUrlBuilder(message.mediaUrl!),
                name: message.mediaName,
              ),
            ],
            if (isOwn) ...[
              const SizedBox(height: 8),
              Row(
                mainAxisAlignment: MainAxisAlignment.end,
                children: [
                  TextButton.icon(
                    onPressed: onEdit,
                    icon: const Icon(Icons.edit, size: 18),
                    label: const Text('Editar'),
                  ),
                  TextButton.icon(
                    onPressed: onDelete,
                    icon: const Icon(Icons.delete_outline, size: 18),
                    label: const Text('Borrar'),
                  ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }

  String _formatTime(DateTime dateTime) {
    final local = dateTime.toLocal();
    final hour = local.hour.toString().padLeft(2, '0');
    final minute = local.minute.toString().padLeft(2, '0');
    return '$hour:$minute';
  }
}
