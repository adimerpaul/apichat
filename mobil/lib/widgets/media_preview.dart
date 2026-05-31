import 'package:flutter/material.dart';

class MediaPreview extends StatelessWidget {
  const MediaPreview({
    super.key,
    required this.type,
    required this.url,
    required this.name,
  });

  final String? type;
  final String url;
  final String? name;

  @override
  Widget build(BuildContext context) {
    if (type == 'image') {
      return ClipRRect(
        borderRadius: BorderRadius.circular(6),
        child: Image.network(
          url,
          fit: BoxFit.cover,
          headers: const {'ngrok-skip-browser-warning': 'true'},
          errorBuilder: (context, error, stackTrace) {
            return const Text('No se pudo cargar la imagen.');
          },
        ),
      );
    }

    return Row(
      children: [
        const Icon(Icons.videocam_outlined),
        const SizedBox(width: 8),
        Expanded(child: Text(name ?? 'Video adjunto')),
      ],
    );
  }
}
