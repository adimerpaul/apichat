import 'dart:convert';

import 'package:http/http.dart' as http;

class ChatApiService {
  ChatApiService({required this.baseUrl});

  final String baseUrl;

  Map<String, String> get _headers => const {
    'Content-Type': 'application/json',
    'ngrok-skip-browser-warning': 'true',
  };

  Future<void> editMessage({
    required int messageId,
    required int userId,
    required String message,
  }) async {
    final response = await http.put(
      Uri.parse('$baseUrl/api/chats/$messageId'),
      headers: _headers,
      body: jsonEncode({'user_id': userId, 'message': message}),
    );

    _ensureOk(response, 'No se pudo editar.');
  }

  Future<void> deleteMessage({
    required int messageId,
    required int userId,
  }) async {
    final request =
        http.Request('DELETE', Uri.parse('$baseUrl/api/chats/$messageId'))
          ..headers.addAll(_headers)
          ..body = jsonEncode({'user_id': userId});
    final streamed = await request.send();
    final response = await http.Response.fromStream(streamed);

    _ensureOk(response, 'No se pudo borrar.');
  }

  void _ensureOk(http.Response response, String fallbackMessage) {
    final data = jsonDecode(response.body) as Map<String, dynamic>;

    if (response.statusCode >= 400 || data['ok'] != true) {
      throw Exception(data['message'] ?? fallbackMessage);
    }
  }
}
